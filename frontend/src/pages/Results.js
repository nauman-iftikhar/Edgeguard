import React, { useContext } from 'react'
import Navbar from '../components/Navbar'
import { ThemeContext } from '../App'

export default function Results() {
  const { dark } = useContext(ThemeContext)

  const C = {
    bg:      dark ? '#0f0f0f' : '#f0f2f5',
    card:    dark ? '#1a1a1a' : '#ffffff',
    border:  dark ? '#333'    : '#e0e0e0',
    text:    dark ? '#aaa'    : '#555',
    heading: dark ? '#ffffff' : '#1a1a2e',
    dim:     dark ? '#555'    : '#999',
    accent:  '#1D9E75',
    blue:    '#2563a8',
  }

  const setup = [
    {
      title: 'Cluster Hardware',
      icon: '🖥️',
      items: [
        '8× Raspberry Pi 3B+ — 4 cores each, 1GB RAM (32 cores total)',
        '1× Raspberry Pi 5 — Master node, control plane only (excluded from compute)',
        '1× Raspberry Pi 4 — Camera/sensor node',
        'Network: 2× TP-Link switches, 100Mbit/s LAN (10.10.10.0/24)',
        'Active fan cooling throughout all benchmarks',
      ]
    },
    {
      title: 'MPI Benchmarks — Task 3',
      icon: '⚡',
      items: [
        'Tool: OpenMPI — custom C programs compiled on Pi3',
        'Example 1: Monte Carlo Pi — O(1) communication (single MPI_Reduce)',
        'Example 2: Matrix Multiplication — O(N²) communication (MPI_Bcast + Scatter/Gather)',
        'Core counts tested: 1, 2, 4, 8, 16, 32',
        'Problem sizes: 0.1M, 1M, 10M, 100M, 1B, 10B points (Monte Carlo)',
        'Matrix sizes: N=1000, 1500, 2000, 3000, 3250, 3500, 3750, 4000',
        'Runs per configuration: 3–5 · Cooldown: 15–30s between runs',
        'k3s-agent stopped on all Pi3 nodes before benchmarking',
      ]
    },
    {
      title: 'HPL Benchmark — Task 2',
      icon: '📊',
      items: [
        'Tool: HPCC 1.5.0 (High Performance LINPACK)',
        'Block size NB=128, optimized for ARM Cortex-A53',
        'Problem size N scaled with available RAM per configuration',
        'Core counts: 1, 2, 4, 8, 16, 24, 32 · 4 runs per config',
        'Pi3-02 placed last in node order (power instability under load)',
        'Results reported in GFLOPS (higher = better)',
      ]
    },
    {
      title: 'Task Distributor — Task 4',
      icon: '🔧',
      items: [
        "Tool: Prof. Baun's Task Distributor (SpringerPlus 2016)",
        'Workload: POV-Ray ray-tracing — benchmark.pov scene',
        'Resolutions: 400×300, 800×600, 1600×1200, 3200×2400',
        'Node counts: 1, 2, 4, 8 nodes · 5 runs per configuration',
        'Timing split: seq1 (SSH dispatch) + parallel (render) + seq2 (ImageMagick stitch)',
        'Maximum feasible resolution: 3200×2400 (4800×3600 exceeds /tmp limit)',
      ]
    },
    {
      title: 'Measurement Conditions',
      icon: '🔬',
      items: [
        'All benchmarks run on idle cluster — no production workloads',
        'Temperature monitored via Prometheus (kept below 65°C)',
        'Zombie process check before each MPI run',
        'NFS shared binary and hostfile for all MPI jobs',
        'Results saved to CSV on /nfs/shared/ after each run',
      ]
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <Navbar />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>

        {/* Header */}
        <h2 style={{ color: C.heading, fontSize: '1.7rem', fontWeight: 800, marginBottom: 8 }}>
          Benchmark Results
        </h2>
        <p style={{ color: C.dim, fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
          Parallel scaling benchmarks across MPI-based (Tasks 2 & 3) and non-MPI (Task 4) approaches.
          All results compared against Amdahl's and Gustafson's theoretical speedup laws.
        </p>

        {/* View Results Button */}
        <a
          href="https://nauman-iftikhar.github.io/Edgeguard/results.html"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: C.accent, color: 'white',
            padding: '14px 28px', borderRadius: 10,
            textDecoration: 'none', fontWeight: 700, fontSize: 15,
            marginBottom: 40, boxShadow: '0 4px 12px rgba(13,158,117,0.3)',
            transition: 'all 0.15s',
          }}
        >
          📊 View Full Interactive Results →
        </a>

        {/* Test Setup Cards */}
        <h3 style={{ color: C.heading, fontSize: '1.1rem', fontWeight: 700, marginBottom: 16,
          borderLeft: `4px solid ${C.accent}`, paddingLeft: 12 }}>
          Test Setup & Methodology
        </h3>

        {setup.map((section, i) => (
          <div key={i} style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 22, marginBottom: 16,
          }}>
            <p style={{ color: C.heading, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
              {section.icon} {section.title}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {section.items.map((item, j) => (
                <li key={j} style={{
                  color: C.text, fontSize: 13, lineHeight: 1.7,
                  padding: '4px 0', borderBottom: j < section.items.length - 1 ? `1px solid ${C.border}` : 'none',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <span style={{ color: C.accent, marginTop: 2, flexShrink: 0 }}>›</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}

      </div>
    </div>
  )
}
