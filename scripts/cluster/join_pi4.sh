#!/bin/bash
PI4_IP="10.10.10.40"
PI4_USER="admin"
K3S_TOKEN=$(cat ~/k3s_token.txt)
BACKEND_URL="http://10.10.10.1:8000"
HOSTS_WITH_PI4="/home/admin/mpi_hosts_with_pi4"
HOSTS_CURRENT="/home/admin/mpi_hosts_8nodes"

echo "Checking if k3s installed on Pi4..."
INSTALLED=$(ssh ${PI4_USER}@${PI4_IP} "test -f /usr/local/bin/k3s && echo yes || echo no" 2>/dev/null)

if [ "$INSTALLED" = "yes" ]; then
    echo "k3s found — updating token and starting agent"
    ssh ${PI4_USER}@${PI4_IP} "
        echo 'K3S_URL=https://10.10.10.1:6443' | sudo tee /etc/systemd/system/k3s-agent.service.env
        echo 'K3S_TOKEN=${K3S_TOKEN}' | sudo tee -a /etc/systemd/system/k3s-agent.service.env
        sudo systemctl daemon-reload
        sudo systemctl restart k3s-agent
        sleep 5
        sudo systemctl is-active k3s-agent
    " 2>/dev/null
else
    echo "Installing k3s fresh on Pi4"
    ssh ${PI4_USER}@${PI4_IP} "
        curl -sfL https://get.k3s.io | \
        K3S_URL=https://10.10.10.1:6443 \
        K3S_TOKEN=${K3S_TOKEN} \
        sh - > /dev/null 2>&1
    " 2>/dev/null
fi

sleep 60

# Check if Pi4 joined
PI4_NODE=$(sudo kubectl get nodes --no-headers 2>/dev/null | grep -v "master\|pi3" | awk '{print $1}')
if [ ! -z "$PI4_NODE" ]; then
    echo "✅ Pi4 joined as $PI4_NODE"
    cp $HOSTS_WITH_PI4 $HOSTS_CURRENT
    
    # Post event to backend
    curl -s -X POST "${BACKEND_URL}/api/autoscaler/event" \
        -H "Content-Type: application/json" \
        -d '{"message":"Pi4 joined cluster successfully","pi4_status":"active","cpu":90}' \
        > /dev/null 2>&1
else
    echo "❌ Pi4 failed to join"
fi

# Wait and retry check
for i in 1 2 3 4 5; do
    PI4_NODE=$(sudo kubectl get nodes --no-headers 2>/dev/null | grep -v "master\|pi3" | awk '{print $1}')
    if [ ! -z "$PI4_NODE" ]; then
        echo "✅ Pi4 confirmed in cluster as $PI4_NODE"
        break
    fi
    echo "Waiting for Pi4... attempt $i"
    sleep 10
done

# Wait and retry check
for i in 1 2 3 4 5; do
    PI4_NODE=$(sudo kubectl get nodes --no-headers 2>/dev/null | grep -v "master\|pi3" | awk '{print $1}')
    if [ ! -z "$PI4_NODE" ]; then
        echo "✅ Pi4 confirmed in cluster as $PI4_NODE"
        break
    fi
    echo "Waiting for Pi4... attempt $i"
    sleep 10
done
