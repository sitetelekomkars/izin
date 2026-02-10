<script>
    let currentUser = null;
    const views = {login: document.getElementById('view-login'), dashboard: document.getElementById('view-dashboard') };
    const userInfoPanel = document.getElementById('user-info-panel');

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

    if(viewName === 'dashboard') userInfoPanel.classList.remove('view-hidden');
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

    // Check if running in GAS or Local
    if (typeof google === 'undefined' || !google.script) {
        alert("Bu proje sadece Google Apps Script ortamında çalışır. Lütfen deploy edip deneyin.");
    btn.innerText = originalText; btn.disabled = false;
    return;
    }

    google.script.run
        .withSuccessHandler((response) => {
            if (response.status === 'success') {
        currentUser = response;
    document.getElementById('user-display').innerText = `${currentUser.user} (${currentUser.role})`;
    setupDashboardByRole(currentUser.role);
    switchView('dashboard');
    // Şifre alanını temizle
    document.getElementById('password').value = '';
            } else {
        alert(response.message);
            }
    btn.innerText = originalText; btn.disabled = false;
        })
        .withFailureHandler((err) => {
        alert('Hata: ' + err);
    btn.innerText = originalText; btn.disabled = false;
        })
    .loginUser(user, pass);
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
        
        <!-- Tab 1: Form -->
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

        <!-- Tab 2: Tablo -->
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

    // 2. YÖNETİCİ EKRANI (TL, SPV, İK)
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

    google.script.run
        .withSuccessHandler(() => {
        alert('Talep başarıyla oluşturuldu!');
    e.target.reset();
    btn.innerText = 'Talebi Gönder'; btn.disabled = false;
    // Tab değiştir
    const reqTabBtn = document.querySelectorAll('.tab-btn')[1];
    showTab('my-requests', reqTabBtn);
        })
    .createRequest(data);
}

    function loadRequests() {
        google.script.run.withSuccessHandler((data) => {
            if (currentUser.role === 'Temsilci') {
                const tbody = document.querySelector('#requests-table tbody');
                document.getElementById('stat-pending').innerText = data.filter(r => r.status.includes('Bekliyor')).length;
                document.getElementById('stat-approved').innerText = data.filter(r => r.status === 'Onaylandı').length;

                tbody.innerHTML = data.length ? data.map(r => `
                <tr>
                    <td>${formatDate(r.start)} - ${formatDate(r.end)}</td>
                    <td>${r.type}</td>
                    <td><span class="status-badge ${getStatusClass(r.status)}">${r.status}</span></td>
                    <td style="font-size:0.8em">TL:${r.tl} > SPV:${r.spv} > İK:${r.ik}</td>
                </tr>`).join('') : '<tr><td colspan="4">Kayıt yok.</td></tr>';

            } else {
                // Yönetici Görünümü
                const tbody = document.querySelector('#approval-table tbody');
                document.getElementById('stat-pending-action').innerText = data.length;

                tbody.innerHTML = data.length ? data.map(r => `
                <tr>
                    <td><strong>${r.requester}</strong><br><small>${r.project}</small></td>
                    <td>${r.type}<br><small>${r.reason}</small></td>
                    <td>${formatDate(r.start)}<br>${formatDate(r.end)}</td>
                    <td>
                        <button class="action-btn btn-approve" onclick="processRequest('${r.id}', 'Onaylandı')">Onayla</button>
                        <button class="action-btn btn-reject" onclick="processRequest('${r.id}', 'Reddedildi')">Reddet</button>
                    </td>
                </tr>`).join('') : '<tr><td colspan="4">Onay bekleyen talep yok.</td></tr>';
            }
        }).getRequests(currentUser.role, currentUser.user, currentUser.project);
}

    function processRequest(id, decision) {
    if(!confirm(decision + ' olarak işaretlemek istiyor musunuz?')) return;
    google.script.run.withSuccessHandler(() => {
        alert('İşlem tamamlandı.');
    loadRequests();
    }).updateRequestStatus(id, currentUser.role, decision);
}

    // Yardımcılar
    function showTab(tabId, btn) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('tab-new-request').style.display = 'none';
    document.getElementById('tab-my-requests').style.display = 'none';

    document.getElementById(tabId).style.display = 'block';
    if(tabId === 'my-requests') loadRequests();
}

    function formatDate(dateStr) { 
    if(!dateStr) return '-';
    try { return dateStr.split('T')[0]; } catch(e) { return dateStr; }
}
    function getStatusClass(status) {
    if(status === 'Onaylandı') return 'status-approved';
    if(status.includes('Red')) return 'status-rejected';
    return 'status-pending';
}
</script>
