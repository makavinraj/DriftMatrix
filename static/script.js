/* =====================================
   🔥 PARTICLE BACKGROUND
===================================== */

const canvas = document.getElementById("particle-canvas");
const ctxParticles = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particles = [];
let currentDriftLevel = "stable";
let particleBoost = false;

for (let i = 0; i < 80; i++) {
    particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2,
        dx: (Math.random() - 0.5) * 0.5,
        dy: (Math.random() - 0.5) * 0.5
    });
}

function animateParticles() {

    ctxParticles.fillStyle = "rgba(0,0,0,0.15)";
    ctxParticles.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {

        if (particleBoost) {
            p.dx *= 1.5;
            p.dy *= 1.5;
        }

        p.x += p.dx;
        p.y += p.dy;

        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;

        ctxParticles.beginPath();
        ctxParticles.arc(p.x, p.y, p.r, 0, Math.PI * 2);

        let color;
        if (currentDriftLevel === "stable")
            color = "rgba(0,204,102,0.5)";
        else if (currentDriftLevel === "warning")
            color = "rgba(255,170,0,0.5)";
        else
            color = "rgba(255,0,51,0.6)";

        ctxParticles.fillStyle = color;
        ctxParticles.fill();

        if (currentDriftLevel === "danger") {
            ctxParticles.globalAlpha = 0.2;
            ctxParticles.fill();
            ctxParticles.globalAlpha = 1;
        }
    });

    requestAnimationFrame(animateParticles);
}

animateParticles();

/* =====================================
   📊 LINE CHART
===================================== */

const driftChart = new Chart(document.getElementById("driftChart"), {
    type: "line",
    data: {
        labels: [],
        datasets: [{
            label: "Hybrid Alignment %",
            data: [],
            borderColor: "#ff6a00",
            backgroundColor: "rgba(255,106,0,0.2)",
            tension: 0.3,
            fill: true
        }]
    },
    options: {
        responsive: true,
        plugins: { legend: { labels: { color: "white" } } },
        scales: {
            x: { ticks: { color: "white" } },
            y: { ticks: { color: "white" }, min: 0, max: 100 }
        }
    }
});

/* =====================================
   🎯 GAUGE
===================================== */

const gaugeChart = new Chart(document.getElementById("gaugeChart"), {
    type: "doughnut",
    data: {
        datasets: [{
            data: [0, 100],
            backgroundColor: ["#00cc66", "#222"],
            borderWidth: 0
        }]
    },
    options: {
        rotation: -90,
        circumference: 180,
        cutout: "75%",
        plugins: { legend: { display: false } }
    }
});

/* =====================================
   💬 SEND MESSAGE
===================================== */

async function sendMessage() {

    const input = document.getElementById("user-input");
    const chatBox = document.getElementById("chat-box");
    const sendBtn = document.querySelector(".send-btn");

    const userText = input.value.trim();
    if (!userText) return;

    sendBtn.classList.add("button-loading");
    sendBtn.classList.add("launch");
    sendBtn.classList.add("click-feedback");

    particleBoost = true;
    setTimeout(() => particleBoost = false, 300);
    setTimeout(() => sendBtn.classList.remove("launch"), 400);
    setTimeout(() => sendBtn.classList.remove("click-feedback"), 200);

    const userMessage = document.createElement("div");
    userMessage.classList.add("message", "user");
    userMessage.textContent = userText;
    chatBox.appendChild(userMessage);

    input.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;

    const typingIndicator = document.createElement("div");
    typingIndicator.classList.add("message", "ai");
    typingIndicator.textContent = "AI is typing...";
    chatBox.appendChild(typingIndicator);

    const response = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: userText })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let aiMessage = null;
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        buffer += chunk;

        if (!aiMessage) {
            typingIndicator.remove();
            aiMessage = document.createElement("div");
            aiMessage.classList.add("message", "ai");
            chatBox.appendChild(aiMessage);
        }

        if (buffer.includes("<<STRICT>>")) {

            const strict = parseFloat(buffer.split("<<STRICT>>")[1].split("<<PROG>>")[0]);
            const prog = parseFloat(buffer.split("<<PROG>>")[1].split("<<HYB>>")[0]);
            const hyb = parseFloat(buffer.split("<<HYB>>")[1].split("<<ITER>>")[0]);
            const iteration = buffer.split("<<ITER>>")[1].split("<<SW>>")[0];
            const sw = parseFloat(buffer.split("<<SW>>")[1].split("<<PW>>")[0]);
            const pw = parseFloat(buffer.split("<<PW>>")[1]);

            document.getElementById("iteration-count").innerText = iteration;
            document.getElementById("strict-score").innerText = strict.toFixed(2) + "%";
            document.getElementById("prog-score").innerText = prog.toFixed(2) + "%";
            document.getElementById("strict-weight").innerText = sw.toFixed(2);
            document.getElementById("prog-weight").innerText = pw.toFixed(2);

            updateGaugeAndStatus(hyb);
            updateLineChart(iteration, hyb);

            buffer = "";
        }
        else {
            aiMessage.textContent += chunk;
        }

        chatBox.scrollTop = chatBox.scrollHeight;
    }

    sendBtn.classList.remove("button-loading");
}

/* =====================================
   🎯 UPDATE GAUGE + STATUS
===================================== */

function updateGaugeAndStatus(hyb) {

    const status = document.getElementById("system-status");

    gaugeChart.data.datasets[0].data = [hyb, 100 - hyb];

    if (hyb < 30) {
        currentDriftLevel = "stable";
        gaugeChart.data.datasets[0].backgroundColor[0] = "#00cc66";
        status.className = "status stable";
        status.innerText = "Stable";
        document.body.classList.remove("critical");
    }
    else if (hyb < 60) {
        currentDriftLevel = "warning";
        gaugeChart.data.datasets[0].backgroundColor[0] = "#ffaa00";
        status.className = "status warning";
        status.innerText = "Drifting";
        document.body.classList.remove("critical");
    }
    else {
        currentDriftLevel = "danger";
        gaugeChart.data.datasets[0].backgroundColor[0] = "#ff0033";
        status.className = "status danger";
        status.innerText = "Critical Drift";
        document.body.classList.add("critical");

        if (hyb > 70) {
            const dash = document.querySelector(".dashboard");
            dash.classList.add("shake");
            setTimeout(() => dash.classList.remove("shake"), 300);
        }
    }

    gaugeChart.update();
    document.getElementById("drift-value").innerText = hyb.toFixed(2) + "%";
}

/* =====================================
   📈 UPDATE GRAPH
===================================== */

function updateLineChart(iteration, hyb) {

    if (driftChart.data.labels.length > 20) {
        driftChart.data.labels.shift();
        driftChart.data.datasets[0].data.shift();
    }

    driftChart.data.labels.push(iteration);
    driftChart.data.datasets[0].data.push(hyb);
    driftChart.update();
}

/* =====================================
   🎛 DECISION BUTTONS
===================================== */

async function handleDecision(action) {

    await fetch("/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
    });

    const chatBox = document.getElementById("chat-box");
    const msg = document.createElement("div");
    msg.classList.add("message", "ai");

    if (action === "accept")
        msg.textContent = "✅ Output accepted. Baseline updated.";

    else if (action === "realign")
        msg.textContent = "🔁 Realigned to original intent.";

    else if (action === "reject") {

        msg.textContent = "❌ Conversation reset.";

        document.getElementById("iteration-count").innerText = "0";
        document.getElementById("strict-score").innerText = "0%";
        document.getElementById("prog-score").innerText = "0%";
        document.getElementById("drift-value").innerText = "0%";
        document.getElementById("strict-weight").innerText = "0";
        document.getElementById("prog-weight").innerText = "0";

        const status = document.getElementById("system-status");
        status.className = "status stable";
        status.innerText = "Stable";

        gaugeChart.data.datasets[0].data = [0, 100];
        gaugeChart.data.datasets[0].backgroundColor[0] = "#00cc66";
        gaugeChart.update();

        driftChart.data.labels = [];
        driftChart.data.datasets[0].data = [];
        driftChart.update();

        document.body.classList.remove("critical");
        currentDriftLevel = "stable";
    }

    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
}

/* =====================================
   ⌨️ ENTER KEY
===================================== */

document.getElementById("user-input").addEventListener("keydown", function(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});