#!/bin/bash
NEW_IP=$1

if [ -z "$NEW_IP" ]; then
    echo "Usage: ./fix_ip.sh <NEW_IP>"
    exit 1
fi

# Get active JS file from index.html
FRONTEND_POD=$(kubectl get pods -l app=frontend -o jsonpath='{.items[0].metadata.name}')
ACTIVE_JS=$(kubectl exec $FRONTEND_POD -- cat /usr/share/nginx/html/index.html | grep -o 'main\.[a-z0-9]*\.js' | head -1)
OLD_IP=$(kubectl exec $FRONTEND_POD -- grep -oh '192\.168\.[0-9]*\.[0-9]*' /usr/share/nginx/html/static/js/$ACTIVE_JS 2>/dev/null | sort -u | head -1)

echo "Active JS:       $ACTIVE_JS"
echo "Detected old IP: $OLD_IP"
echo "New IP:          $NEW_IP"
echo ""

# Update active JS in all frontend pods
echo "Updating frontend pods..."
for pod in $(kubectl get pods -l app=frontend -o jsonpath='{.items[*].metadata.name}'); do
    JS=$(kubectl exec $pod -- cat /usr/share/nginx/html/index.html | grep -o 'main\.[a-z0-9]*\.js' | head -1)
    kubectl exec $pod -- sed -i "s/$OLD_IP/$NEW_IP/g" /usr/share/nginx/html/static/js/$JS
    echo "  ✅ $pod ($JS) updated"
done

# Update database image URLs
echo "Updating database image URLs..."
kubectl exec -it postgres-0 -- psql -U admin -d edgeguard -c \
    "UPDATE events SET image_url = REPLACE(image_url, '$OLD_IP', '$NEW_IP');" 2>/dev/null
echo "  ✅ Database updated"

echo ""
echo "✅ Done! Open: http://$NEW_IP:30080"
echo "⚠️  Hard refresh browser: Ctrl+Shift+R"
