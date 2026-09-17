// Lottie JSON 压缩 —— 与 Mac 版 LottieExporter.swift 行为对齐。
//
// 处理链:
//   1. 解析 JSON
//   2. options.strip_assets → 移除 root.assets
//   3. options.strip_metadata → 递归移除 nm/mn/cl/ln
//   4. 始终:strip 掉可推断的默认值(ddd=0, ip=0, hd=false)
//   5. options.float_precision < 6 → 递归截断浮点位数
//   6. minify vs pretty 序列化

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LottieOptions {
    pub minify: bool,
    pub float_precision: u8,   // 0..6
    pub strip_assets: bool,
    pub strip_metadata: bool,
    pub output_directory: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub output_path: String,
    pub output_bytes: u64,
}

const METADATA_KEYS: &[&str] = &["nm", "mn", "cl", "ln"];

pub fn export(source: &str, opts: &LottieOptions) -> Result<ExportResult> {
    let raw = fs::read(source).with_context(|| format!("read: {source}"))?;
    let mut json: Value = serde_json::from_slice(&raw).context("parse Lottie JSON")?;

    let root = json.as_object_mut().ok_or_else(|| anyhow!("Lottie 根不是对象"))?;

    if opts.strip_assets {
        root.remove("assets");
    }
    if opts.strip_metadata {
        strip_metadata_map(root);
    }
    strip_default_values_map(root);

    if opts.float_precision < 6 {
        // 用 root 版本的 truncate 逐字段走
        truncate_floats_map(root, opts.float_precision);
    }

    // 序列化。sorted_keys 是 Mac 版行为对齐;serde_json 默认按插入顺序,得手动。
    let sorted = sort_keys(&json);
    let bytes = if opts.minify {
        serde_json::to_vec(&sorted)?
    } else {
        serde_json::to_vec_pretty(&sorted)?
    };

    let out_dir = crate::image_module::resolve_output_dir_pub(&opts.output_directory)?;
    fs::create_dir_all(&out_dir).context("mkdir output directory")?;

    let src = Path::new(source);
    let base = src.file_stem().and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("bad file name: {source}"))?;
    let out = unique_output_path(&out_dir, base, "json");

    fs::write(&out, &bytes).context("write output")?;
    let size = fs::metadata(&out)?.len();
    Ok(ExportResult {
        output_path: out.to_string_lossy().into_owned(),
        output_bytes: size,
    })
}

fn strip_metadata_map(map: &mut Map<String, Value>) {
    for k in METADATA_KEYS {
        map.remove(*k);
    }
    for (_k, v) in map.iter_mut() {
        strip_metadata_value(v);
    }
}
fn strip_metadata_value(v: &mut Value) {
    match v {
        Value::Object(m) => strip_metadata_map(m),
        Value::Array(a)  => for x in a.iter_mut() { strip_metadata_value(x); },
        _ => {}
    }
}

fn strip_default_values_map(map: &mut Map<String, Value>) {
    if let Some(Value::Number(n)) = map.get("ddd") {
        if n.as_i64() == Some(0) { map.remove("ddd"); }
    }
    if let Some(Value::Number(n)) = map.get("ip") {
        if n.as_f64() == Some(0.0) { map.remove("ip"); }
    }
    if let Some(Value::Bool(false)) = map.get("hd") { map.remove("hd"); }

    for (_, v) in map.iter_mut() {
        strip_default_values_value(v);
    }
}
fn strip_default_values_value(v: &mut Value) {
    match v {
        Value::Object(m) => strip_default_values_map(m),
        Value::Array(a)  => for x in a.iter_mut() { strip_default_values_value(x); },
        _ => {}
    }
}

fn truncate_floats_map(map: &mut Map<String, Value>, decimals: u8) {
    for (_, v) in map.iter_mut() {
        truncate_floats_value(v, decimals);
    }
}
fn truncate_floats_value(v: &mut Value, decimals: u8) {
    match v {
        Value::Object(m) => truncate_floats_map(m, decimals),
        Value::Array(a)  => for x in a.iter_mut() { truncate_floats_value(x, decimals); },
        Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                if !f.is_finite() { return; }
                // 只对小数动;整数保留原状(避免 3 变成 3.0)
                if f.fract() == 0.0 { return; }
                let mul = 10f64.powi(decimals as i32);
                let rounded = (f * mul).round() / mul;
                if let Some(num) = serde_json::Number::from_f64(rounded) {
                    *v = Value::Number(num);
                }
            }
        }
        _ => {}
    }
}

fn sort_keys(v: &Value) -> Value {
    match v {
        Value::Object(m) => {
            let mut sorted = Map::new();
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort();
            for k in keys {
                sorted.insert(k.clone(), sort_keys(&m[k]));
            }
            Value::Object(sorted)
        }
        Value::Array(a) => Value::Array(a.iter().map(sort_keys).collect()),
        _ => v.clone(),
    }
}

fn unique_output_path(dir: &Path, base: &str, ext: &str) -> PathBuf {
    let mut c = dir.join(format!("{base}.{ext}"));
    if !c.exists() { return c; }
    for i in 2..u32::MAX {
        c = dir.join(format!("{base}-{i}.{ext}"));
        if !c.exists() { return c; }
    }
    dir.join(format!("{base}-{}.{}", std::process::id(), ext))
}
