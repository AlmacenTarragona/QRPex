// CONFIGURACIÓN (GOOGLE APPS SCRIPT)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzoyuUmft0lvQsL9-rljoADDZns179nvZ3irQK-hX8Gd1nHR170bcp07Kx7xZe7sqs9/exec";

// ELEMENTOS DOM
const setupScreen = document.getElementById('setup-form');
const workspaceScreen = document.getElementById('workspace-container');
const readerElement = document.getElementById('reader');

// Inputs
const installerInput = document.getElementById('installer-code');
const actuationInput = document.getElementById('actuation-code');

// Botones
const startBtn = document.getElementById('start-scan-btn');
const stopBtn = document.getElementById('stop-scan-btn');
const torchBtn = document.getElementById('torch-btn');
const resetBtn = document.getElementById('reset-btn');
const sendBtn = document.getElementById('send-btn');

// Sliders
const zoomRow = document.getElementById('zoom-row');
const zoomSlider = document.getElementById('zoom-slider');
const brightnessSlider = document.getElementById('brightness-slider');
const contrastSlider = document.getElementById('contrast-slider');

// Toggle Controles
const settingsBtn = document.getElementById('settings-btn');
const toggleSlidersBtn = document.getElementById('toggle-sliders-btn');
const slidersWrapper = document.getElementById('sliders-wrapper');

// Tabla
const tableBody = document.querySelector('#data-table tbody');
const emptyState = document.getElementById('empty-state');

// ESTADO
let html5QrCode;
let readings = [];
let currentSettings = { installer: '', actuation: '' };
let streamTrack = null;
let capabilities = {};
let isTorchOn = false;
let lastScanned = null;
let lastTime = 0;

// NUEVO ESTADO PARA INVERSIÓN REAL
let isInvertedMode = false;
let inversionInterval = null;

// AUDIO CONTEXT (BEEP)
let audioCtx = null;

// INICIO
document.addEventListener('DOMContentLoaded', () => {
    // IMPORTANTE: Usamos la versión 13 con soporte DataMatrix
    html5QrCode = new Html5Qrcode("reader");
    renderTable();
});

// LISTENERS
startBtn.addEventListener('click', () => {
    const inst = installerInput.value.trim();
    const act = actuationInput.value.trim();

    if (!inst || !act) {
        showModal("⚠️", "Campos Incompletos", "Por favor, completa el Código de Instalador y el Nº de Actuación.", true, false, 'error');
        return;
    }

    const techRegex = /^\d{4}$/;
    if (!techRegex.test(inst)) {
        showModal("🚫", "Error de Técnico", "El Código de Instalador debe tener exactamente <b>4 números</b>.", true, false, 'error');
        return;
    }

    currentSettings = { installer: inst, actuation: act };
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    startCamera();
});

stopBtn.addEventListener('click', () => {
    showModal("🔄", "Confirmar Cambio", "Se va a retroceder para poder cambiar de ACTUACION.", true, false, 'info', () => stopCamera(true), "CANCELAR");
});

resetBtn.addEventListener('click', () => {
    if (readings.length === 0) return;
    if (confirm("🗑️ ¿Borrar TODA la lista?")) {
        readings = [];
        saveAndRender();
    }
});

sendBtn.addEventListener('click', sendDataToGoogle);
brightnessSlider.addEventListener('input', updateFilters);
contrastSlider.addEventListener('input', updateFilters);

function updateFilters() {
    const b = brightnessSlider.value;
    const c = contrastSlider.value;
    const video = document.querySelector('#reader video');
    if (video) {
        // Mantenemos la inversión visual sincronizada con la lógica
        const inv = isInvertedMode ? 'invert(1)' : 'invert(0)';
        video.style.filter = `${inv} brightness(${b}) contrast(${c})`;
    }
}

// --- LÓGICA DE INVERSIÓN REAL DE PÍXELES ---
// Esta función intercepta el canvas de la librería y voltea los colores
function applyPixelInversion() {
    const canvas = document.querySelector('#reader canvas');
    if (!canvas || !isInvertedMode) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        data[i]     = 255 - data[i];     // R
        data[i + 1] = 255 - data[i + 1]; // G
        data[i + 2] = 255 - data[i + 2]; // B
    }
    ctx.putImageData(imageData, 0, 0);
}

// CÁMARA
async function startCamera() {
    setupScreen.classList.add('hidden');
    workspaceScreen.classList.remove('hidden');

    const config = {
        fps: 20, // Subimos un poco los FPS para compensar el procesado
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        formatsToSupport: [Html5QrcodeSupportedFormats.DATA_MATRIX]
    };

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            onScan,
            (err) => {
                // Cada vez que hay un error (el 99% del tiempo mientras busca),
                // intentamos invertir el frame si el modo está activo.
                applyPixelInversion();
            }
        );
        
        setTimeout(setupCameraHardware, 500);

        // CICLO DE ALTERNANCIA: 3 segundos normal, 3 segundos invertido
        inversionInterval = setInterval(() => {
            isInvertedMode = !isInvertedMode;
            updateFilters(); // Actualizar visualmente para el usuario
            console.log("Modo Invertido:", isInvertedMode);
        }, 3000);

    } catch (e) {
        console.error(e);
        showModal("❌", "Error de Cámara", "No se pudo acceder a la cámara.", true, false, 'error');
        stopCamera();
    }
}

async function stopCamera(fromBackButton = false) {
    if (inversionInterval) clearInterval(inversionInterval);
    isInvertedMode = false;

    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
    }
    
    workspaceScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    isTorchOn = false;
    torchBtn.disabled = true;

    if (fromBackButton) {
        installerInput.disabled = true;
        actuationInput.disabled = false;
    }
}

function onScan(decodedText) {
    const now = Date.now();
    if (decodedText === lastScanned && (now - lastTime < 2000)) return;

    const isDuplicate = readings.some(r => r.code === decodedText);
    if (isDuplicate) {
        playErrorSound();
        showModal("🛑", "Código Duplicado", `El código <b>${decodedText}</b> ya existe.`, true, false, 'error');
        return;
    }

    lastScanned = decodedText;
    lastTime = now;

    playBeep();
    if (navigator.vibrate) navigator.vibrate(200);

    const newItem = {
        id: now,
        timestamp: new Date().toLocaleTimeString('es-ES'),
        installer: currentSettings.installer.toUpperCase(),
        actuation: currentSettings.actuation.toUpperCase(),
        code: decodedText
    };

    readings.unshift(newItem);
    saveAndRender();
}

// --- SONIDOS ---
function playBeep() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

function playErrorSound() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

// --- HARDWARE ---
function setupCameraHardware() {
    const video = document.querySelector("#reader video");
    if (video && video.srcObject) {
        updateFilters();
        const track = video.srcObject.getVideoTracks()[0];
        if (track) {
            streamTrack = track;
            capabilities = track.getCapabilities ? track.getCapabilities() : {};
            if (capabilities.torch) {
                torchBtn.disabled = false;
                torchBtn.onclick = toggleTorch;
            }
            if (capabilities.zoom) {
                zoomRow.style.display = 'flex';
                zoomSlider.min = capabilities.zoom.min;
                zoomSlider.max = capabilities.zoom.max;
                zoomSlider.value = capabilities.zoom.min;
                zoomSlider.oninput = (e) => {
                    track.applyConstraints({ advanced: [{ zoom: e.target.value }] });
                };
            }
        }
    }
}

async function toggleTorch() {
    if (!streamTrack) return;
    isTorchOn = !isTorchOn;
    try {
        await streamTrack.applyConstraints({ advanced: [{ torch: isTorchOn }] });
        torchBtn.classList.toggle('active', isTorchOn);
    } catch (e) { isTorchOn = !isTorchOn; }
}

// --- TABLA Y ENVÍO ---
function saveAndRender() {
    localStorage.setItem('dm_readings', JSON.stringify(readings));
    renderTable();
}

function renderTable() {
    tableBody.innerHTML = '';
    if (readings.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';
    readings.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${item.installer}</td><td>${item.actuation}</td><td class="code-cell">${item.code}</td><td><button class="delete-btn" onclick="deleteItem(${item.id})">🗑️</button></td>`;
        tableBody.appendChild(tr);
    });
}

window.deleteItem = function (id) {
    showModal("🗑️", "¿Eliminar fila?", "Esta acción no se puede deshacer.", true, false, 'info', () => {
        readings = readings.filter(r => r.id !== id);
        saveAndRender();
    }, "CANCELAR");
};

const modalOverlay = document.getElementById('status-modal');
const modalIcon = document.getElementById('modal-icon');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);

function showModal(icon, title, msg, showBtn = false, spin = false, type = 'info', onConfirm = null, cancelTxt = null) {
    if (!modalOverlay) return;
    const content = modalOverlay.querySelector('.modal-content');
    content.className = `modal-content ${type}`;
    modalIcon.textContent = icon;
    modalTitle.textContent = title;
    modalMessage.innerHTML = msg;
    modalIcon.classList.toggle('spinning', spin);
    modalCloseBtn.classList.toggle('hidden', !showBtn);
    modalCloseBtn.onclick = () => { closeModal(); if (onConfirm) onConfirm(); };
    if (cancelTxt) {
        modalCancelBtn.textContent = cancelTxt;
        modalCancelBtn.classList.remove('hidden');
    } else {
        modalCancelBtn.classList.add('hidden');
    }
    modalOverlay.classList.remove('hidden');
}

function closeModal() { modalOverlay.classList.add('hidden'); }

async function actuallySend() {
    showModal("⏳", "Enviando...", "Sincronizando...", false, true);
    try {
        const dataToSend = readings.map(item => [
            item.installer, item.actuation, item.code, 
            new Date(item.id).toLocaleTimeString('es-ES')
        ]);
        const finalUrl = `${APPS_SCRIPT_URL}?data=${encodeURIComponent(JSON.stringify(dataToSend))}`;

        fetch(finalUrl, { method: 'GET', mode: 'no-cors' });

        setTimeout(() => {
            showModal("✅", "¡Éxito!", "Datos enviados.", true, false, 'success');
            readings = [];
            saveAndRender();
            stopCamera(false);
        }, 2000);
    } catch (error) {
        showModal("❌", "Error", error.message, true, false, 'error');
    }
}

function sendDataToGoogle() {
    if (readings.length === 0) return;
    showModal("📤", "Confirmar Envío", `Se enviarán ${readings.length} registros.`, true, false, 'info', actuallySend, "CANCELAR");
}
