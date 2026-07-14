# Cluster Setup

[← Back to Home](index.md)

EdgeGuard runs on a heterogeneous cluster of 10 Raspberry Pi single-board computers connected over a dedicated internal network. This page describes the hardware decisions, network design, and how the cluster was assembled.

---

## Why Heterogeneous?

Most university clusters use identical hardware throughout. We deliberately chose a heterogeneous approach — mixing Raspberry Pi 5, Pi 4, and Pi 3 nodes — to reflect real-world edge computing deployments where different hardware serves different purposes.

Each node type has a specific, justified role:

| Node | Model | Why This Hardware |
|------|-------|-------------------|
| Pi 5 | Raspberry Pi 5 + Hailo AI HAT+ | Most powerful SBC in the Pi family; needed for real-time AI inference at production frame rates. The Hailo AI HAT+ adds a dedicated 26 TOPS neural processing unit. |
| Pi 4 | Raspberry Pi 4 + AI Camera Module | Dedicated camera node with hardware camera interface. Kept separate from compute to avoid inference load affecting stream quality. |
| Pi 3 × 8 | Raspberry Pi 3B+ | Low-cost, low-power compute workers. Homogeneous among themselves — ideal for benchmarking parallel workloads on identical hardware. |

---

## The Pi3-06 Design Decision

One deliberate design choice worth explaining: **pi3-06 boots from a local SD card** rather than PXE over the network like the other seven Pi 3 nodes.

This was intentional. We wanted to answer a real question: *does a node booting from local SD card perform differently from an identical node booting disklessly over NFS in the same cluster?*

`[IMAGE: photo of the physical cluster showing the switch and nodes]`

Having one SD-card node alongside seven PXE nodes gave us a natural comparison point throughout all our benchmarking. In practice, pi3-06 showed consistently comparable performance to its PXE-booting peers in all compute benchmarks, confirming that the NFS root filesystem approach introduces no significant compute overhead — the network is fast enough over the dedicated 10.10.10.0/24 switch that I/O latency is not a bottleneck for CPU-bound workloads.

---

## Network Design

All nodes communicate over a dedicated internal network (`10.10.10.0/24`) via a managed switch. Pi 5 also connects to the external WiFi network for remote access.

```
External WiFi (10.100.47.0/24)
        │
        │ wlan0 — 10.100.47.201 (remote SSH access)
   ┌────┴──────────────────────────────┐
   │       Pi 5 — master-node          │
   │       eth0 — 10.10.10.1           │
   │                                   │
   │  Serves to internal network:      │
   │  • DHCP (static IP by MAC)        │
   │  • TFTP (PXE boot files)          │
   │  • NFS (Pi 3 root filesystems)    │
   └────┬──────────────────────────────┘
        │
   [Managed Switch — 10.10.10.0/24]
        │
        ├── 10.10.10.21  pi3-01  (PXE diskless)
        ├── 10.10.10.22  pi3-02  (PXE diskless)
        ├── 10.10.10.23  pi3-03  (PXE diskless)
        ├── 10.10.10.24  pi3-04  (PXE diskless)
        ├── 10.10.10.25  pi3-05  (PXE diskless)
        ├── 10.10.10.26  pi3-06  (SD card boot)
        ├── 10.10.10.27  pi3-07  (PXE diskless)
        ├── 10.10.10.28  pi3-08  (PXE diskless)
        └── 10.10.10.40  sensor-node / Pi 4
```

---

## PXE Network Boot

Seven of the eight Pi 3 nodes boot entirely over the network — no SD cards, no local storage of any kind. On power-on, each node:

1. Broadcasts a DHCP request over the network
2. Pi 5's dnsmasq DHCP server responds with a static IP (assigned by MAC address) and points the node to Pi 5's TFTP server for boot files
3. The node loads its boot firmware and kernel from TFTP
4. The kernel mounts its root filesystem from Pi 5's NFS server
5. The node boots into Raspberry Pi OS running entirely in RAM backed by NFS

Each Pi 3 has its own isolated NFS root at `/nfs/clients/pi3-XX/` on Pi 5. A shared NFS volume at `/nfs/shared/` is also mounted by all nodes for MPI benchmarking — compiled binaries and hostfiles placed here are immediately accessible to every node without separate copies.

`[IMAGE: screenshot of kubectl get nodes showing all nodes Ready]`

### A Challenge We Discovered

After the first full cluster reboot, we found that `dnsmasq` was starting before `eth0` was fully initialized, causing it to fail with "unknown interface eth0". This left all Pi 3 nodes without DHCP leases and unable to PXE boot.

The fix was a systemd drop-in that forces dnsmasq to wait for the network to be fully online:

```bash
# /etc/systemd/system/dnsmasq.service.d/wait-for-eth0.conf
[Unit]
After=network-online.target
Wants=network-online.target
```

This is a good example of the kind of infrastructure problem that only surfaces after the first reboot — not during initial setup.

---

## Static IP Assignment

Pi 5's dnsmasq assigns static IPs to each node based on its MAC address, ensuring every node always gets the same IP regardless of boot order. This is critical for MPI jobs (which reference nodes by hostname) and for k3s (which needs stable node identities).

---

## Hostname Resolution

An early problem: `pi3-01` through `pi3-08` hostnames were resolving via mDNS, which was unreliable — MPI jobs would occasionally fail because hostname resolution timed out mid-job.

The fix was adding static entries to both `/etc/hosts` and the cloud-init template on Pi 5. Pi 5 uses cloud-init with `manage_etc_hosts: True`, which overwrites `/etc/hosts` on every reboot. We had to edit the cloud-init template (`/etc/cloud/templates/hosts.debian.tmpl`) directly to make these entries survive reboots — something that cost us several hours to diagnose the first time.

---

## Boot Sequence After Reboot

```
T+0s    Pi 5 boots, eth0 comes up
T+15s   dnsmasq starts (DHCP + TFTP)
T+20s   Pi 3 nodes power on, broadcast DHCP requests
T+25s   Pi 3 nodes receive IPs, begin PXE boot
T+60s   Pi 3 nodes mount NFS root, booting OS
T+90s   Pi 3 nodes fully booted
T+120s  All nodes Ready in cluster
T+180s  All pods rescheduled and running
```

Total cold-start to fully operational: approximately 3-5 minutes.

---

[Next: AI Inference Pipeline →](inference.md)
