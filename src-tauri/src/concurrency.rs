// 后端并发闸门 —— 用两个静态 Semaphore 卡住:
//   - 视频:每台机器 max(1, cpu-2),否则 ffmpeg 会把 CPU 吃满、UI 卡顿
//   - 图片/lottie/document:min(8, cpu),这些是 I/O + 短 CPU,可以并发多些
//
// 用 std::sync::Semaphore 需要 nightly,这里用一个简单的 std::sync::Mutex + Condvar
// 实现的计数 semaphore,好处是没有额外依赖。

use std::sync::{Condvar, Mutex};

pub struct CountingSem {
    mu: Mutex<usize>,
    cv: Condvar,
}

impl CountingSem {
    pub const fn new(initial: usize) -> Self {
        Self { mu: Mutex::new(initial), cv: Condvar::new() }
    }
    pub fn acquire(&self) -> SemGuard<'_> {
        let mut n = self.mu.lock().unwrap();
        while *n == 0 {
            n = self.cv.wait(n).unwrap();
        }
        *n -= 1;
        SemGuard { sem: self }
    }
}

pub struct SemGuard<'a> { sem: &'a CountingSem }
impl Drop for SemGuard<'_> {
    fn drop(&mut self) {
        let mut n = self.sem.mu.lock().unwrap();
        *n += 1;
        self.sem.cv.notify_one();
    }
}

// —— 全局实例 ——
use std::sync::OnceLock;

fn cpu_count() -> usize { num_cpus::get().max(2) }

pub fn video_sem() -> &'static CountingSem {
    static S: OnceLock<CountingSem> = OnceLock::new();
    S.get_or_init(|| CountingSem::new((cpu_count() - 1).max(1).min(4)))
}

pub fn cpu_sem() -> &'static CountingSem {
    static S: OnceLock<CountingSem> = OnceLock::new();
    S.get_or_init(|| CountingSem::new(cpu_count().min(8)))
}
