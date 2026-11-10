use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::{lock, TabManager};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessStat { pid: u32, name: String, memory_bytes: u64, cpu_time_100ns: u64, command_line: String }

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceStats { total_memory_bytes: u64, processes: Vec<ProcessStat>, tab_count: usize }

#[cfg(windows)]
#[tauri::command]
pub fn get_performance_stats(app: AppHandle) -> PerformanceStats {
    use windows::Win32::System::Diagnostics::ToolHelp::*;
    use windows::Win32::System::Threading::*;
    use windows::Win32::System::ProcessStatus::*;
    use windows::Win32::Foundation::CloseHandle;

    let tab_count = {
        let state = app.state::<Mutex<TabManager>>();
        let m = lock(&state);
        m.order.len()
    };
    let current_pid = std::process::id();

    // Snapshot aller Prozesse
    let mut parent: std::collections::HashMap<u32, u32> = std::collections::HashMap::new();
    let mut names: std::collections::HashMap<u32, String> = std::collections::HashMap::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).unwrap_or_default();
        let mut pe = PROCESSENTRY32W::default();
        pe.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snap, &mut pe).is_ok() {
            loop {
                let pid = pe.th32ProcessID;
                parent.insert(pid, pe.th32ParentProcessID);
                let name = String::from_utf16_lossy(&pe.szExeFile).trim_end_matches('\0').to_string();
                names.insert(pid, name);
                if Process32NextW(snap, &mut pe).is_err() { break; }
            }
        }
        let _ = CloseHandle(snap);
    }

    // Nachkommen des aktuellen Prozesses sammeln (rekursiv)
    let mut descendants: Vec<u32> = Vec::new();
    let mut stack = vec![current_pid];
    while let Some(p) = stack.pop() {
        for (pid, ppid) in &parent {
            if *ppid == p && *pid != current_pid {
                if !descendants.contains(pid) {
                    descendants.push(*pid);
                    stack.push(*pid);
                }
            }
        }
    }
    // aktuellen Prozess selbst mit aufnehmen
    descendants.insert(0, current_pid);

    let mut processes = Vec::new();
    let mut total = 0u64;
    for pid in &descendants {
        let h = unsafe { OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, *pid) };
        let (mem, cpu) = match h {
            Ok(handle) => {
                let mut pmc = PROCESS_MEMORY_COUNTERS::default();
                pmc.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
                let r = unsafe { GetProcessMemoryInfo(handle, &mut pmc, pmc.cb) };
                let m = if r.is_ok() { pmc.WorkingSetSize as u64 } else { 0 };
                let mut creation = windows::Win32::Foundation::FILETIME::default();
                let mut exit = windows::Win32::Foundation::FILETIME::default();
                let mut kernel = windows::Win32::Foundation::FILETIME::default();
                let mut user = windows::Win32::Foundation::FILETIME::default();
                let c = unsafe { GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) };
                let cpu = if c.is_ok() {
                    let k = ((kernel.dwHighDateTime as u64) << 32) | kernel.dwLowDateTime as u64;
                    let u = ((user.dwHighDateTime as u64) << 32) | user.dwLowDateTime as u64;
                    k + u
                } else { 0 };
                unsafe { let _ = CloseHandle(handle); }
                (m, cpu)
            }
            Err(_) => (0, 0),
        };
        total += mem;
        let name = names.get(pid).cloned().unwrap_or_else(|| "unknown".into());
        let label = if *pid == current_pid { format!("{} (Hauptprozess)", name) } else { name };
        processes.push(ProcessStat {
            pid: *pid,
            name: label,
            memory_bytes: mem,
            cpu_time_100ns: cpu,
            command_line: String::new(),
        });
    }
    processes.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));

    PerformanceStats { total_memory_bytes: total, processes, tab_count }
}

#[cfg(not(windows))]
#[tauri::command]
pub fn get_performance_stats(app: AppHandle) -> PerformanceStats {
    let tab_count = { let state = app.state::<Mutex<TabManager>>(); let m = lock(&state); m.order.len() };
    PerformanceStats { total_memory_bytes: 0, processes: vec![], tab_count }
}

