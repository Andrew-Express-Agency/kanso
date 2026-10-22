/**
 * Kanso Hardware & Acceleration Radar
 * Detects NVIDIA RTX CUDA, TensorRT-LLM, and Apple Silicon Metal engines.
 */

import { execSync } from "child_process";
import os from "os";

export interface HardwareInfo {
  platform: string;
  arch: string;
  gpuType: "nvidia" | "apple_silicon" | "intel_amd" | "cpu_only";
  gpuName?: string;
  cudaVersion?: string;
  accelerationEngine: string;
  localAiReady: boolean;
  nvidiaNimCompatible: boolean;
}

export function detectHardware(): HardwareInfo {
  const platform = os.platform();
  const arch = os.arch();

  // 1. Check for NVIDIA GPU via nvidia-smi
  try {
    const nvidiaOut = execSync("nvidia-smi --query-gpu=name,driver_version --format=csv,noheader", {
      stdio: ["pipe", "pipe", "ignore"],
      encoding: "utf-8",
    }).trim();

    if (nvidiaOut) {
      const parts = nvidiaOut.split(",");
      const gpuName = parts[0]?.trim();
      let cudaVer = "";

      try {
        const cudaOut = execSync("nvcc --version", { stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8" });
        const m = cudaOut.match(/release (\d+\.\d+)/);
        if (m) cudaVer = m[1];
      } catch {}

      return {
        platform,
        arch,
        gpuType: "nvidia",
        gpuName: gpuName || "NVIDIA RTX GPU",
        cudaVersion: cudaVer || undefined,
        accelerationEngine: "NVIDIA CUDA / TensorRT-LLM",
        localAiReady: true,
        nvidiaNimCompatible: true,
      };
    }
  } catch {}

  // 2. Check for Apple Silicon Metal & Neural Engine
  if (platform === "darwin" && (arch === "arm64" || arch === "arm")) {
    let chip = "Apple Silicon";
    try {
      chip = execSync("sysctl -n machdep.cpu.brand_string", { stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8" }).trim() || chip;
    } catch {}

    return {
      platform,
      arch,
      gpuType: "apple_silicon",
      gpuName: chip,
      accelerationEngine: "Apple Metal & Unified Neural Engine",
      localAiReady: true,
      nvidiaNimCompatible: false,
    };
  }

  return {
    platform,
    arch,
    gpuType: "cpu_only",
    accelerationEngine: "Standard Host Threading",
    localAiReady: false,
    nvidiaNimCompatible: false,
  };
}
