/* app.js */
let currentUser = null;
const views = { login: document.getElementById('view-login'), dashboard: document.getElementById('view-dashboard') };
const userInfoPanel = document.getElementById('user-info-panel');
// Google Apps Script ortamında mıyız kontrolü
const isGas = typeof google !== 'undefined' && google.script;

/* --- GÖRÜNÜM YÖNETİMİ --- */
function switchView(viewName) {
    Object.values(views).forEach(el => {
        el.classList.add('view-hidden');
        el.classList.remove('view-active');
    });
    const target = views[viewName];
    target.classList.remove('view-hidden');
    void target.offsetWidth; // reflow tetikle
    target.classList.add('view-active');

    if (viewName === 'dashboard') userInfoPanel.classList.remove('view-hidden');
    else userInfoPanel.classList.add('view-hidden');
}

/* --- LOGİN --- */
function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;

    btn.innerText = 'Kontrol ediliyor...'; btn.disabled = true;

    if (isGas) {
        // GERÇEK ORTAM (Google Apps Script)
        google.script.run
            .withSuccessHandler((response) => loginCallback(response, btn, originalText))
            .withFailureHandler((err) => { alert('Hata: ' + err); btn.innerText = originalText; btn.disabled = false; })
            .loginUser(user, pass);
    } else {
        // DEMO ORTAMI (GitHub / Yerel)
        console.warn("Demo Modunda Çalışıyor");
        setTimeout(() => {
            // Basit Mock Mantığı
            let response = { status: 'error', message: 'Hatalı giriş (Demo)' };
            if (user.startsWith('rep_') && pass === 'proje123') response = { status: 'success', role: 'Temsilci', user: user, project: 'Proje A' };
            else if (['tl_user', 'spv_user', 'ik_user'].includes(user) && pass === '1234') {
                const roles = { 'tl_user': 'TL', 'spv_user': 'SPV', 'ik_user': 'IK' };
                response = { status: 'success', role: roles[user], user: user };
            }
            loginCallback(response, btn, originalText);
        }, 800);
    }
}

function loginCallback(response, btn, originalText) {
    if (response.status === 'success') {
        currentUser = response;
        document.getElementById('user-display').innerText = `${currentUser.user} (${currentUser.role})`;
        setupDashboardByRole(currentUser.role);
        switchView('dashboard');
        document.getElementById('password').value = '';
    } else {
        alert(response.message);
    }
    btn.innerText = originalText; btn.disabled = false;
}

function logout() {
    currentUser = null;
    switchView('login');
}

/* --- DASHBOARD --- */
function setupDashboardByRole(role) {
    const container = document.getElementById('dashboard-content');
    container.innerHTML = '';

    if (role === 'Temsilci') renderRepDashboard(container);
    else renderManagementDashboard(container, role);
}

// 1. TEMSİLCİ EKRANI
function renderRepDashboard(container) {
    container.innerHTML = `
        <div class="dashboard-grid">
            <div class="stat-card"><h3>Bekleyen</h3><div class="count" id="stat-pending">...</div></div>
            <div class="stat-card"><h3>Onaylanan</h3><div class="count" id="stat-approved">...</div></div>
        </div>
        <div class="tabs">
            <button class="tab-btn active" onclick="showTab('new-request', this)">Yeni İzin Talebi</button>
            <button class="tab-btn" onclick="showTab('my-requests', this)">Taleplerim</button>
        </div>
        
        <div id="tab-new-request">
            <div class="login-card" style="max-width: 600px; margin: 0; text-align: left;">
                <form onsubmit="submitRequest(event)">
                    <div class="form-group"><label>İzin Türü</label>
                        <select class="form-select" id="req-type" required>
                            <option>Yıllık İzin</option><option>Hastalık</option><option>Mazeret</option>
                        </select>
                    </div>
                    <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div><label>Başlangıç</label><input type="date" class="form-input" id="req-start" required></div>
                        <div><label>Bitiş</label><input type="date" class="form-input" id="req-end" required></div>
                    </div>
                    <div class="form-group"><label>Açıklama</label><textarea class="form-input" id="req-reason" rows="3" required></textarea></div>
                    <button type="submit" class="btn-primary">Talebi Gönder</button>
                </form>
            </div>
        </div>

        <div id="tab-my-requests" style="display:none;">
            <div class="table-container">
                <table id="requests-table">
                    <thead><tr><th>Tarih</th><th>Tür</th><th>Durum</th><th>Detay</th></tr></thead>
                    <tbody><tr><td colspan="4">Yükleniyor...</td></tr></tbody>
                </table>
            </div>
        </div>
    `;
    loadRequests();
}

// 2. YÖNETİCİ EKRANI
function renderManagementDashboard(container, role) {
    container.innerHTML = `
        <div class="dashboard-grid">
            <div class="stat-card"><h3>Bekleyen İşlem</h3><div class="count" id="stat-pending-action">...</div></div>
        </div>
        <h3>Onay Bekleyen Talepler (${role})</h3>
        <div class="table-container">
            <table id="approval-table">
                <thead><tr><th>Personel</th><th>Detaylar</th><th>Tarih</th><th>İşlem</th></tr></thead>
                <tbody><tr><td colspan="4">Veriler çekiliyor...</td></tr></tbody>
            </table>
        </div>
    `;
    loadRequests();
}

/* --- VERİ İŞLEMLERİ --- */
function submitRequest(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = 'Gönderiliyor...'; btn.disabled = true;

    const data = {
        requester: currentUser.user,
        project: currentUser.project,
        type: document.getElementById('req-type').value,
        startDate: document.getElementById('req-start').value,
        endDate: document.getElementById('req-end').value,
        reason: document.getElementById('req-reason').value
    };

    if (isGas) {
        google.script.run.withSuccessHandler(() => afterSubmit(e, btn)).createRequest(data);
    } else {
        // Mock Submit
        setTimeout(() => { alert('Demo: Talep gönderildi (Kayıt edilmedi)'); afterSubmit(e, btn); }, 500);
    }
}

function afterSubmit(e, btn) {
    e.target.reset();
    btn.innerText = 'Talebi Gönder'; btn.disabled = false;
    const reqTabBtn = document.querySelectorAll('.tab-btn')[1];
    showTab('my-requests', reqTabBtn);
}

function loadRequests() {
    if (isGas) {
        google.script.run.withSuccessHandler(renderRequests).getRequests(currentUser.role, currentUser.user, currentUser.project);
    } else {
        // Mock Data
        setTimeout(() => {
            const mockData = [
                { id: 1, requester: 'rep_ali', project: 'Proje A', type: 'Yıllık', start: '2023-11-01', end: '2023-11-05', status: 'TL Onayı Bekliyor', tl: 'Bekliyor', spv: 'Bekliyor', ik: 'Bekliyor' },
                { id: 2, requester: 'rep_ayse', project: 'Proje A', type: 'Hastalık', start: '2023-11-02', end: '2023-11-02', status: 'Onaylandı', tl: 'Onaylandı', spv: 'Onaylandı', ik: 'Onaylandı' }
            ];
            // Basit filtreleme
            let filtered = mockData;
            if (currentUser.role === 'Temsilci') filtered = mockData.filter(r => r.requester === currentUser.user || currentUser.user === 'rep_ali'); // Demo hilesi
            else if (currentUser.role === 'TL') filtered = mockData.filter(r => r.status.includes('TL'));
            renderRequests(filtered);
        }, 500);
    }
}

function renderRequests(data) {
    if (!data) data = [];
    if (currentUser.role === 'Temsilci') {
        const tbody = document.querySelector('#requests-table tbody');
        if (tbody) {
            document.getElementById('stat-pending').innerText = data.filter(r => r.status.includes('Bekliyor')).length;
            document.getElementById('stat-approved').innerText = data.filter(r => r.status === 'Onaylandı').length;
            tbody.innerHTML = data.length ? data.map(r => `
                <tr>
                    <td>${formatDate(r.start)} - ${formatDate(r.end)}</td>
                    <td>${r.type}</td>
                    <td><span class="status-badge ${getStatusClass(r.status)}">${r.status}</span></td>
                    <td style="font-size:0.8em">TL:${r.tl} > SPV:${r.spv} > İK:${r.ik}</td>
                </tr>`).join('') : '<tr><td colspan="4">Kayıt yok.</td></tr>';
        }
    } else {
        const tbody = document.querySelector('#approval-table tbody');
        if (tbody) {
            document.getElementById('stat-pending-action').innerText = data.length;
            tbody.innerHTML = data.length ? data.map(r => `
                <tr>
                    <td><strong>${r.requester}</strong><br><small>${r.project}</small></td>
                    <td>${r.type}<br><small>${r.reason || ''}</small></td>
                    <td>${formatDate(r.start)}<br>${formatDate(r.end)}</td>
                    <td>
                        <button class="action-btn btn-approve" onclick="processRequest('${r.id}', 'Onaylandı')">Onayla</button>
                        <button class="action-btn btn-reject" onclick="processRequest('${r.id}', 'Reddedildi')">Reddet</button>
                    </td>
                </tr>`).join('') : '<tr><td colspan="4">Talep yok.</td></tr>';
        }
    }
}

function processRequest(id, decision) {
    if (!confirm(decision + ' yapılacak?')) return;
    if (isGas) {
        google.script.run.withSuccessHandler(() => { alert('Tamamlandı'); loadRequests(); }).updateRequestStatus(id, currentUser.role, decision);
    } else {
        alert('Demo: İşlem yapıldı (' + decision + ')');
        loadRequests();
    }
}

function showTab(tabId, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-new-request').style.display = 'none';
    document.getElementById('tab-my-requests').style.display = 'none';
    document.getElementById(tabId).style.display = 'block';
    if (tabId === 'my-requests') loadRequests();
}

function formatDate(dateStr) { if (!dateStr) return '-'; try { return dateStr.split('T')[0]; } catch (e) { return dateStr; } }
function getStatusClass(status) { if (status === 'Onaylandı') return 'status-approved'; if (status && status.includes('Red')) return 'status-rejected'; return 'status-pending'; }
