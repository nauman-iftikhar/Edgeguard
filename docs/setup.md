# Infrastructure Setup

[← Back to Home](index.md)

This page documents the complete infrastructure setup for the EdgeGuard cluster — a heterogeneous 10-node Raspberry Pi system running k3s Kubernetes with PXE network boot.

---

## Hardware Overview

| Node | Hostname | IP | Model | Role |
|------|----------|----|-------|------|
| Pi 5 | master-node | 10.10.10.1 | Raspberry Pi 5 + Hailo AI HAT+ | Master, DHCP/TFTP/NFS, inference |
| Pi 4 | sensor-node | 10.10.10.40 | Raspberry Pi 4 + AI Camera Module | Camera stream (ZMQ) |
| Pi 3 #1 | pi3-01 | 10.10.10.21 | Raspberry Pi 3B+ | k3s worker (diskless PXE) |
| Pi 3 #2 | pi3-02 | 10.10.10.22 | Raspberry Pi 3B+ | k3s worker (diskless PXE) |
| Pi 3 #3 | pi3-03 | 10.10.10.23 | Raspberry Pi 3B+ | k3s worker (diskless PXE) |
| Pi 3 #4 | pi3-04 | 10.10.10.24 | Raspberry Pi 3B+ | k3s worker (diskless PXE) |
| Pi 3 #5 | pi3-05 | 10.10.10.25 | Raspberry Pi 3B+ | k3s worker (diskless PXE) |
| Pi 3 #6 | pi3-06 | 10.10.10.26 | Raspberry Pi 3B+ | k3s worker (diskless PXE) |
| Pi 3 #7 | pi3-07 | 10.10.10.27 | Raspberry Pi 3B+ | k3s worker (diskless PXE) |
| Pi 3 #8 | pi3-08 | 10.10.10.28 | Raspberry Pi 3B+ | k3s worker (diskless PXE) |

All nodes are connected via a dedicated 10.10.10.0/24 internal network through a managed switch. Pi 5 also connects to the external network via WiFi (wlan0, 10.100.47.201) for remote SSH access.

---

## Network Architecture

```
Internet / External Network (10.100.47.0/24)
        │
        │ wlan0 (10.100.47.201)
   ┌────┴────────────────────────────────────┐
   │          Raspberry Pi 5 (master-node)   │
   │  eth0 (10.10.10.1)                      │
   │  ├── DHCP server (dnsmasq)              │
   │  ├── TFTP server (dnsmasq)              │
   │  ├── NFS server (exports)               │
   │  ├── k3s control plane                  │
   │  └── Local container registry (:5000)   │
   └────┬────────────────────────────────────┘
        │ eth0
        │ 10.10.10.0/24 (internal switch)
        ├── 10.10.10.21  pi3-01
        ├── 10.10.10.22  pi3-02
        ├── 10.10.10.23  pi3-03
        ├── 10.10.10.24  pi3-04
        ├── 10.10.10.25  pi3-05
        ├── 10.10.10.26  pi3-06
        ├── 10.10.10.27  pi3-07
        ├── 10.10.10.28  pi3-08
        └── 10.10.10.40  sensor-node (Pi 4)
```

---

## Step 1 — Pi 5 Base Setup

Install Raspberry Pi OS (64-bit) on the Pi 5 SD card. Enable SSH and configure the static IP on `eth0`:

```bash
# /etc/dhcpcd.conf
interface eth0
static ip_address=10.10.10.1/24
```

Install required packages:

```bash
sudo apt update && sudo apt install -y \
  dnsmasq nfs-kernel-server \
  docker.io git curl wget
```

---

## Step 2 — PXE Boot Setup (Diskless Pi 3 Nodes)

The Pi 3 nodes boot entirely over the network — no SD cards required. Pi 5 serves DHCP, TFTP (boot files), and NFS (root filesystem) for all 8 Pi 3 workers.

### 2.1 — Prepare NFS Root Filesystems

Create a separate NFS root for each Pi 3 node:

```bash
sudo mkdir -p /nfs/clients/pi3-01
sudo mkdir -p /nfs/clients/pi3-02
# ... repeat for pi3-03 through pi3-08

# Copy a base Raspberry Pi OS image into each client directory
# (debootstrap or rsync from a reference Pi 3 SD card)
sudo rsync -avx /media/sdcard/ /nfs/clients/pi3-01/
```

Configure NFS exports (`/etc/exports`):

```
/nfs/clients/pi3-01  10.10.10.21(rw,sync,no_subtree_check,no_root_squash)
/nfs/clients/pi3-02  10.10.10.22(rw,sync,no_subtree_check,no_root_squash)
/nfs/clients/pi3-03  10.10.10.23(rw,sync,no_subtree_check,no_root_squash)
/nfs/clients/pi3-04  10.10.10.24(rw,sync,no_subtree_check,no_root_squash)
/nfs/clients/pi3-05  10.10.10.25(rw,sync,no_subtree_check,no_root_squash)
/nfs/clients/pi3-06  10.10.10.26(rw,sync,no_subtree_check,no_root_squash)
/nfs/clients/pi3-07  10.10.10.27(rw,sync,no_subtree_check,no_root_squash)
/nfs/clients/pi3-08  10.10.10.28(rw,sync,no_subtree_check,no_root_squash)
/nfs/shared           10.10.10.0/24(rw,sync,no_subtree_check,no_root_squash)
sudo exportfs -ra
sudo systemctl restart nfs-kernel-server
```

### 2.2 — Configure TFTP Boot Files

Each Pi 3 needs its boot firmware served via TFTP. The Pi 3's serial number determines which boot folder it uses:

```bash
sudo mkdir -p /tftpboot
# Copy boot files for each Pi 3 (identified by their serial number folder)
# e.g. /tftpboot/66745be3/ for pi3-01
```

### 2.3 — Configure dnsmasq (DHCP + TFTP)

`/etc/dnsmasq.conf`:

```ini
interface=eth0
bind-interfaces

# DHCP — assign static IPs by MAC address
dhcp-range=10.10.10.20,10.10.10.100,12h
dhcp-host=<MAC_pi3-01>,pi3-01,10.10.10.21
dhcp-host=<MAC_pi3-02>,pi3-02,10.10.10.22
dhcp-host=<MAC_pi3-03>,pi3-03,10.10.10.23
dhcp-host=<MAC_pi3-04>,pi3-04,10.10.10.24
dhcp-host=<MAC_pi3-05>,pi3-05,10.10.10.25
dhcp-host=<MAC_pi3-06>,pi3-06,10.10.10.26
dhcp-host=<MAC_pi3-07>,pi3-07,10.10.10.27
dhcp-host=<MAC_pi3-08>,pi3-08,10.10.10.28

# TFTP — serve boot files
enable-tftp
tftp-root=/tftpboot
pxe-service=0,"Raspberry Pi Boot"
```

> **Important:** dnsmasq must start after eth0 is fully up. Add a systemd drop-in to ensure this:

```bash
sudo mkdir -p /etc/systemd/system/dnsmasq.service.d
sudo tee /etc/systemd/system/dnsmasq.service.d/wait-for-eth0.conf << EOF
[Unit]
After=network-online.target
Wants=network-online.target
EOF
sudo systemctl daemon-reload
```

### 2.4 — Configure Pi 3 NFS Root

In each Pi 3's NFS root, edit `/etc/fstab` to mount the root filesystem over NFS:

```
10.10.10.1:/nfs/clients/pi3-01  /  nfs  defaults,vers=3  0  0
10.10.10.1:/tftpboot/<serial>   /boot/firmware  nfs  defaults,vers=3  0  0
```

Set `cmdline.txt` in the TFTP boot folder to point to the NFS root:

```
console=serial0,115200 console=tty1 root=/dev/nfs nfsroot=10.10.10.1:/nfs/clients/pi3-01,vers=3 rw ip=dhcp rootwait
```

---

## Step 3 — k3s Kubernetes Cluster

### 3.1 — Install k3s on Pi 5 (Master)

```bash
curl -sfL https://get.k3s.io | sh -
sudo kubectl get nodes
```

Get the cluster token for worker nodes:

```bash
sudo cat /var/lib/rancher/k3s/server/node-token
```

### 3.2 — Install k3s on Pi 3 Worker Nodes

Run on each Pi 3 node (replace TOKEN and SERVER_IP):

```bash
curl -sfL https://get.k3s.io | \
  K3S_URL=https://10.10.10.1:6443 \
  K3S_TOKEN=<token> \
  sh -
```

### 3.3 — Verify Cluster

```bash
kubectl get nodes -o wide
```

Expected output:
```
NAME          STATUS   ROLES           AGE   VERSION
master-node   Ready    control-plane   ...   v1.35.5+k3s1
pi3-01        Ready    <none>          ...   v1.35.5+k3s1
pi3-02        Ready    <none>          ...   v1.35.5+k3s1
...
pi3-08        Ready    <none>          ...   v1.35.5+k3s1
sensor-node   Ready    <none>          ...   v1.35.5+k3s1
```

### 3.4 — Local Container Registry

Pi 5 runs a local Docker registry so k3s can pull images without internet access:

```bash
docker run -d -p 5000:5000 --restart=always --name registry registry:2
```

Configure k3s to trust the insecure registry (`/etc/rancher/k3s/registries.yaml`):

```yaml
mirrors:
  "10.10.10.1:5000":
    endpoint:
      - "http://10.10.10.1:5000"
```

---

## Step 4 — Shared NFS Volume for k3s

A shared NFS volume (`/nfs/shared`) is used by all k3s pods for benchmark data and autoscaler state:

```bash
# On Pi 5
sudo mkdir -p /nfs/shared
sudo chmod 777 /nfs/shared
```

Apply the shared PersistentVolume:

```bash
kubectl apply -f k8s/shared-pv.yaml
```

---

## Step 5 — Systemd Services on Pi 5

Three services run persistently on Pi 5 outside of k3s:

```bash
# Detection service (AI inference + camera stream)
sudo cp services/det.service /etc/systemd/system/
sudo systemctl enable --now det.service

# Stress test server (for auto-scaler testing)
sudo cp services/stress-server.service /etc/systemd/system/
sudo systemctl enable --now stress-server.service

# Auto-scaler (monitors cluster CPU, controls Pi 4 join/leave)
sudo cp services/autoscaler.service /etc/systemd/system/
sudo systemctl enable --now autoscaler.service
```

On Pi 4 (sensor-node):

```bash
# Camera stream service
sudo cp services/main-stream.service /etc/systemd/system/
sudo systemctl enable --now main-stream.service
```

---

## Step 6 — /etc/hosts Configuration

Add Pi 3 hostnames to Pi 5's `/etc/hosts` for reliable SSH and MPI hostname resolution. Edit the cloud-init template so entries survive reboots:

```bash
sudo tee -a /etc/hosts /etc/cloud/templates/hosts.debian.tmpl << EOF
10.10.10.21  pi3-01
10.10.10.22  pi3-02
10.10.10.23  pi3-03
10.10.10.24  pi3-04
10.10.10.25  pi3-05
10.10.10.26  pi3-06
10.10.10.27  pi3-07
10.10.10.28  pi3-08
EOF
```

> **Note:** Pi 5 uses cloud-init with `manage_etc_hosts: True`. Editing `/etc/hosts` directly will be overwritten on reboot. Always edit both files as shown above.

---

## Boot Sequence (After Every Reboot)

When Pi 5 reboots, the following sequence occurs automatically:

```
1. eth0 comes up (10.10.10.1)
2. dnsmasq starts (DHCP + TFTP) — waits for network-online.target
3. Pi 3 nodes power on → receive DHCP lease → PXE boot via TFTP
4. Pi 3 nodes mount their NFS root filesystem from Pi 5
5. Pi 3 nodes start k3s agent → join cluster
6. k3s reschedules pods onto available nodes
7. det.service, stress-server.service, autoscaler.service start on Pi 5
8. main-stream.service starts on Pi 4
```

Total time from power-on to fully operational cluster: approximately 3–5 minutes.

---

## Troubleshooting

**Pi 3 nodes not booting after reboot:**
```bash
# Check if dnsmasq is running
sudo systemctl status dnsmasq

# If failed, start manually (eth0 timing issue)
sudo systemctl start dnsmasq
```

**Nodes showing NotReady in k3s:**
```bash
# Wait 2-3 minutes for PXE boot to complete
kubectl get nodes -w

# Check a specific node's k3s agent
ssh admin@10.10.10.21 "sudo systemctl status k3s-agent"
```

**MPI hostname resolution failures:**
```bash
# Re-add /etc/hosts entries (lost after reboot)
sudo tee -a /etc/hosts << EOF
10.10.10.21  pi3-01
...
EOF
```

---

[Next: Benchmarking Results →](benchmarks.md)
