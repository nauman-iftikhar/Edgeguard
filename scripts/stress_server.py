from flask import Flask, jsonify
import subprocess

app = Flask(__name__)

@app.route("/trigger", methods=["POST"])
def trigger():
    subprocess.Popen([
        "bash", "-c",
        "cd /home/admin/hpl && "
        "nohup mpirun --hostfile /home/admin/mpi_hosts_8nodes "
        "--mca btl_tcp_if_include eth0 -np 36 hpcc "
        "> /tmp/stress.log 2>&1 &"
    ])
    return jsonify({"status": "ok"})

@app.route("/stop", methods=["POST"])
def stop():
    subprocess.run(["pkill", "-f", "hpcc"], capture_output=True)
    subprocess.run(["pkill", "-f", "mpirun"], capture_output=True)
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001)
