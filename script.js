/**
 * REQUISITO CSS:
 * .inverted-filter {
 * filter: invert(1) brightness(1.1) contrast(1.2) !important;
 * }
 */

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

// ESTADO INVERSIÓN (NUEVO)
let isInverted = false;
let inversionInterval = null;

// AUDIO CONTEXT (BEEP)
let audioCtx = null;

// INICIO
document.addEventListener('DOMContentLoaded', () => {
    html5QrCode = new Html5Qrcode("reader");
    renderTable(); // Inicializa tabla vacía
});

// LISTENERS
startBtn.addEventListener('click', () => {
    const inst = installerInput.value.trim();
    const act = actuationInput.value.trim();

    if (!inst || !act) {
        showModal("⚠️", "Campos Incompletos", "Por favor, completa el Código de Instalador y el Nº de Actuación.", true, false, 'error');
        return;
    }

    // Validación Técnico (4 dígitos numéricos)
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
    showModal(
        "🔄",
        "Confirmar Cambio",
        "Se va a retroceder para poder cambiar de ACTUACION, no se perderán los datos ya escaneados.",
        true,
        false,
        'info',
        () => stopCamera(true),
        "CANCELAR"
    );
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

function toggleSliders() {
    const isHidden = slidersWrapper.classList.toggle('hidden');
    toggleSlidersBtn.textContent = isHidden ? '▼' : '▲';
}

if (settingsBtn) settingsBtn.addEventListener('click', toggleSliders);
if (toggleSlidersBtn) toggleSlidersBtn.addEventListener('click', toggleSliders);

function updateFilters() {
    // Si está en modo invertido, no aplicamos los filtros manuales para evitar conflictos visuales
    if (isInverted) return; 

    const b = brightnessSlider.value;
    const c = contrastSlider.value;
    const video = document.querySelector('#reader video');
    if (video) {
        video.style.filter = `brightness(${b}) contrast(${c})`;
    }
}

// FUNCIÓN DE INVERSIÓN (NUEVA)
function toggleInversionCycle() {
    const video = document.querySelector('#reader video');
    if (!video) return;

    isInverted = !isInverted;
    if (isInverted) {
        video.classList.add('inverted-filter');
    } else {
        video.classList.remove('inverted-filter');
        updateFilters(); // Volver a filtros de usuario si existen
    }
}

// CÁMARA
async function startCamera() {
    setupScreen.classList.add('hidden');
    workspaceScreen.classList.remove('hidden');

    const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        formatsToSupport: [Html5QrcodeSupportedFormats.DATA_MATRIX]
    };

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            onScan,
            (err) => { }
        );
        
        setTimeout(setupCameraHardware, 500);

        // INICIAR CICLO DE INVERSIÓN AUTOMÁTICA (Cada 4 segundos)
        inversionInterval = setInterval(toggleInversionCycle, 4000);

    } catch (e) {
        console.error(e);
        showModal("❌", "Error de Cámara", "No se pudo acceder a la cámara o el formato no es compatible.<br><small>" + e + "</small>", true, false, 'error');
        stopCamera();
    }
}

async function stopCamera(fromBackButton = false) {
    // LIMPIAR INTERVALO DE INVERSIÓN
    if (inversionInterval) {
        clearInterval(inversionInterval);
        inversionInterval = null;
    }
    isInverted = false;

    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
    }
    
    workspaceScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    isTorchOn = false;
    torchBtn.disabled = true;
    torchBtn.classList.remove('active');

    if (fromBackButton) {
        installerInput.disabled = true;
        actuationInput.disabled = false;
        actuationInput.focus();
        actuationInput.select();
    }
}

function onScan(decodedText, decodedResult) {
    const now = Date.now();
    if (decodedText === lastScanned && (now - lastTime < 2000)) return;

    const isDuplicate = readings.some(r => r.code === decodedText);
    if (isDuplicate) {
        playErrorSound();
        showModal("🛑", "Código Duplicado", `El código <b>${decodedText}</b> ya ha sido escaneado previamente.`, true, false, 'error');
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

function playBeep() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);
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
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

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
                zoomSlider.step = capabilities.zoom.step || 0.1;
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
        if (isTorchOn) torchBtn.classList.add('active');
        else torchBtn.classList.remove('active');
    } catch (e) {
        isTorchOn = !isTorchOn;
    }
}

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
        tr.innerHTML = `
             <td>${item.installer}</td>
            <td>${item.actuation}</td>
            <td class="code-cell">${item.code}</td>
            <td>
                <button class="delete-btn" onclick="deleteItem(${item.id})">🗑️</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

window.deleteItem = function (id) {
    showModal(
        "🗑️",
        "¿Eliminar fila?",
        "Esta acción no se puede deshacer.",
        true,
        false,
        'info',
        () => {
            readings = readings.filter(r => r.id !== id);
            saveAndRender();
        },
        "CANCELAR"
    );
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
    content.classList.remove('error', 'success', 'info');
    if (type) content.classList.add(type);

    modalIcon.textContent = icon;
    modalTitle.textContent = title;
    modalMessage.innerHTML = msg;

    if (spin) modalIcon.classList.add('spinning');
    else modalIcon.classList.remove('spinning');

    if (showBtn) modalCloseBtn.classList.remove('hidden');
    else modalCloseBtn.classList.add('hidden');

    modalCloseBtn.onclick = () => {
        closeModal();
        if (onConfirm) onConfirm();
    };

    if (cancelTxt) {
        modalCancelBtn.textContent = cancelTxt;
        modalCancelBtn.classList.remove('hidden');
    } else {
        modalCancelBtn.classList.add('hidden');
    }

    modalOverlay.classList.remove('hidden');
}

function closeModal() {
    modalOverlay.classList.add('hidden');
}

function sendDataToGoogle() {
    if (readings.length === 0) {
        showModal("⚠️", "Vacío", "No hay lecturas para enviar.", true, false, 'error');
        return;
    }

    const summary = `Se enviarán ${readings.length} registros.\n\n¿Deseas continuar?`;

    showModal(
        "📤",
        "Confirmar Envío",
        summary,
        true,
        false,
        'info',
        () => actuallySend(),
        "CANCELAR"
    );
}

async function actuallySend() {
    showModal("⏳", "Enviando...", "Sincronizando con Google Sheets...", false, true);

    try {
        const dataToSend = readings.map(item => [
            item.installer,
            item.actuation,
            item.code,
            new Date(item.id).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        ]);

        const jsonPayload = JSON.stringify(dataToSend);
        const encodedData = encodeURIComponent(jsonPayload);
        const finalUrl = `${APPS_SCRIPT_URL}?data=${encodedData}`;

        fetch(finalUrl, {
            method: 'GET',
            mode: 'no-cors',
            cache: 'no-cache'
        }).catch(err => {
            const img = new Image();
            img.src = finalUrl;
        });

        const form = document.createElement('form');
        form.method = 'GET';
        form.action = APPS_SCRIPT_URL;
        form.target = 'silent-sender';
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'data';
        input.value = jsonPayload;
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();

        setTimeout(() => {
            showModal("✅", "¡Éxito!", "Los datos se han enviado correctamente.", true, false, 'success');
            readings = [];
            saveAndRender();
            installerInput.value = '';
            actuationInput.value = '';
            installerInput.disabled = false;
            actuationInput.disabled = false;
            stopCamera(false);
            if (form.parentNode) document.body.removeChild(form);
        }, 2500);

    } catch (error) {
        showModal("❌", "Error", "No se pudo realizar el envío: " + error.message, true, false, 'error');
    }
}
