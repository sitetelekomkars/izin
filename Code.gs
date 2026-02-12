/* 
  Code.gs - MAXIMUM SECURITY & FULL VERSION
*/
const SHEET_ID = '116p2A-X7_QHm7Zz6YM9mSu5Q_MbgTnN6mZAVurCICAw';
const ss = SpreadsheetApp.openById(SHEET_ID);

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); 
    let data = JSON.parse(e.postData.contents);
    const action = data.action;

    // --- ACTIONS (NO SESSION NEEDED) ---
    if (action === 'getLeaveTypes') return successResponse(getLeaveTypes());

    if (action === 'login') {
      // SECURITY: Rate limiting
      const failKey = 'login_fail_' + data.user;
      const failCount = parseInt(CacheService.getScriptCache().get(failKey) || '0');
      
      if (failCount >= 5) {
        addLogFast(data.user || "Bilinmiyor", "Anonim", "Giriş Engellendi", "Rate limit aşıldı.", "N/A", data.clientInfo);
        return errorResponse("Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.");
      }
      
      const res = loginUser(data.user, data.pass);
      if (res.status === 'success') {
        CacheService.getScriptCache().remove(failKey);
        
        if (res.twoFactorStatus !== 'AKTİF') {
          const tokenData = generateToken(res.user, res.role, res.project, res.forceChange);
          addLogFast(res.user, res.role, "Giriş", "Başarılı giriş.", res.project, data.clientInfo);
          return successResponse({ ...res, token: tokenData.token, tokenExpiry: tokenData.expiry });
        }
        if (!res.twoFactorSecret) {
          const newSecret = generateBase32Secret();
          return successResponse({ 
            status: '2fa_setup', user: res.user, secret: newSecret,
            qrUrl: `otpauth://totp/IzinSistemi:${res.user}?secret=${newSecret}&issuer=SiteTelekom`,
            forceChange: res.forceChange
          });
        }
        return successResponse({ status: '2fa_required', user: res.user, forceChange: res.forceChange });
      }
      
      CacheService.getScriptCache().put(failKey, String(failCount + 1), 900);
      addLogFast(data.user || "Bilinmiyor", "Anonim", "Giriş Hatası", "Hatalı deneme.", "N/A", data.clientInfo);
      return errorResponse("Hatalı giriş.");
    }

    if (action === 'verify2fa') {
      const userSecret = data.isSetup ? data.setupSecret : getSecretForUser(data.user);
      if (verifyTotp(userSecret, data.code)) {
        if (data.isSetup) saveSecretForUser(data.user, data.setupSecret);
        const res = getUserBasicInfo(data.user);
        const tokenData = generateToken(res.user, res.role, res.project, data.forceChange);
        addLogFast(res.user, res.role, "Giriş (2FA)", "Güvenli giriş yapıldı.", res.project, data.clientInfo);
        return successResponse({ ...res, token: tokenData.token, tokenExpiry: tokenData.expiry, forceChange: data.forceChange });
      }
      return errorResponse("Hatalı doğrulama kodu.");
    }

    // --- SESSION CONTROL ---
    const session = getSession(data.token);
    if (!session) return errorResponse("Oturum süresi doldu.");

    // --- ACTIONS (SESSION NEEDED) ---
    if (action === 'getRequests') return successResponse(getRequests(session.role, session.user, session.project));
    if (action === 'getUserList') return successResponse(getUserListDetailed(session.role, session.project));
    if (action === 'toggle2fa') {
       addLogFast(session.user, session.role, "Güvenlik", `${data.targetUser} 2FA:${data.newStatus}`, session.project, data.clientInfo);
       return toggle2fa(data.targetUser, data.newStatus);
    }
    if (action === 'updateStatus') {
       addLogFast(session.user, session.role, "İşlem", `ID:${data.id} Karar:${data.decision}`, session.project, data.clientInfo);
       return updateRequestStatus(data.id, session.role, data.decision, data.reason);
    }
    if (action === 'changePassword') {
       return successResponse(changeUserPassword(session.user, data.newPass));
    }
    
    // SECURITY: Authorization checks
    if (action === 'addUser') {
       if (!['İK', 'IK'].includes(session.role)) return errorResponse('Yetkiniz yok');
       return successResponse(addUser(data.newUser, '1234', data.newRole, data.newProject, data.new2fa));
    }
    if (action === 'deleteUser') {
       if (!['İK', 'IK'].includes(session.role)) return errorResponse('Yetkiniz yok');
       return successResponse(deleteUser(data.targetUser));
    }
    if (action === 'resetPass') {
       if (!['İK', 'IK', 'SPV'].includes(session.role)) return errorResponse('Yetkiniz yok');
       return successResponse(resetUserPassword(data.targetUser));
    }
    if (action === 'getLogs') {
       if (!['İK', 'IK'].includes(session.role)) return errorResponse('Yetkiniz yok');
       return successResponse(getLogs());
    }
    if (action === 'getReportData') {
       if (!['İK', 'IK'].includes(session.role)) return errorResponse('Yetkiniz yok');
       return successResponse(getReportData());
    }
    if (action === 'submitRequest') {
       addLogFast(session.user, session.role, "Talep", `Yeni izin talebi oluşturuldu.`, session.project, data.clientInfo);
       return successResponse(submitRequest(session.user, data.formData));
    }

    return errorResponse("Bilinmeyen işlem.");
  } catch (err) { return errorResponse(err.toString()); } finally { lock.releaseLock(); }
}

function getLeaveTypes() {
  try {
    let sheet = ss.getSheetByName('LeaveTypes');
    if (!sheet) {
      // Sayfa adı tam eşleşmezse (boşluk vb. varsa) listeyi tara
      const sheets = ss.getSheets();
      for (let s of sheets) {
        if (s.getName().trim().toLowerCase() === 'leavetypes') { sheet = s; break; }
      }
    }
    if (!sheet) throw new Error("Sheet not found");
    
    const values = sheet.getDataRange().getValues();
    const list = [];
    for (let i = 0; i < values.length; i++) {
        const val = String(values[i][0]).trim();
        // Başlıkları ve boş hücreleri ele
        if (val && !["izin türü", "izin türleri", "izin"].includes(val.toLowerCase())) {
            list.push(val);
        }
    }
    return list.length > 0 ? list : ["Yıllık İzin", "Mazeret İzni", "Hastalık İzni"];
  } catch(e) {
    return ["Yıllık İzin", "Mazeret İzni", "Hastalık İzni"];
  }
}

function changeUserPassword(u, p) {
  const sheet = ss.getSheetByName('Users'); 
  const d = sheet.getRange("A:A").getValues();
  const newSalt = Utilities.getUuid();
  const newHash = hashPasswordWithSalt(p, newSalt);
  
  for(let i=1; i<d.length; i++) { 
    if(String(d[i][0])===String(u)) { 
      sheet.getRange(i+1, 2).setValue(newHash);
      sheet.getRange(i+1, 5).setValue(newSalt);
      return {status:'success'}; 
    } 
  }
  return {status:'error'};
}

/* --- KRİTİK FONKSİYONLAR --- */
function loginUser(u, p) {
  const data = ss.getSheetByName('Users').getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(u)) {
      const storedHash = String(data[i][1]);
      const storedSalt = String(data[i][4] || '');
      let isCorrect = false;
      
      if (storedSalt) {
        const computedHash = hashPasswordWithSalt(p, storedSalt);
        isCorrect = (storedHash === computedHash);
      } else {
        const md5Hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, p));
        isCorrect = (storedHash === p || storedHash === md5Hash);
        
        if (isCorrect) {
          const newSalt = Utilities.getUuid();
          const newHash = hashPasswordWithSalt(p, newSalt);
          const sheet = ss.getSheetByName('Users');
          sheet.getRange(i + 1, 2).setValue(newHash);
          sheet.getRange(i + 1, 5).setValue(newSalt);
        }
      }
      
      if (isCorrect) {
        const isDefault = (storedHash === '1234' || !storedSalt);
        return { 
          status: 'success', 
          user: data[i][0], 
          role: (data[i][2] === 'MT' ? 'Temsilci' : data[i][2]), 
          project: data[i][3], 
          twoFactorSecret: data[i][5], 
          twoFactorStatus: data[i][6] || 'PASİF', 
          forceChange: isDefault 
        };
      }
    }
  }
  return { status: 'error' };
}

function hashPasswordWithSalt(password, salt) {
  const combined = password + salt;
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combined);
  return Utilities.base64Encode(hash);
}

function generateToken(u, r, p, fc) {
  const t = Utilities.getUuid();
  const expiry = Date.now() + (6 * 60 * 60 * 1000);
  CacheService.getScriptCache().put(t, JSON.stringify({user:u, role:r, project:p, forceChange: fc, expiry: expiry}), 21600);
  return { token: t, expiry: expiry };
}

function getRequests(role, user, userProject) {
  const data = ss.getSheetByName('Requests').getDataRange().getValues(); 
  const res = [];
  const normalizedUserProj = String(userProject || "").trim().toLowerCase();
  
  for (let i = data.length - 1; i >= 1; i--) {
    const requestProj = String(data[i][3] || "").trim().toLowerCase();
    const o = { 
      id: String(data[i][0]), 
      requester: data[i][1], 
      fullName: data[i][2], 
      project: data[i][3] || "Genel", 
      type: data[i][4], 
      start: data[i][5], 
      end: data[i][6], 
      reason: data[i][7], 
      status: data[i][8], 
      tl: data[i][9], 
      spv: data[i][10], 
      ik: data[i][11] 
    };
    
    // İK: Tüm talepleri görür
    if (['İK', 'IK'].includes(role)) {
      res.push(o);
    }
    // MT/Temsilci: Sadece kendi taleplerini görür
    else if (role === 'Temsilci' || role === 'MT') {
      if (o.requester === user) res.push(o);
    }
    // TL/SPV: Kendi projelerinin taleplerini görür
    else if (role === 'TL' || role === 'SPV') {
      if (requestProj === normalizedUserProj && normalizedUserProj !== "") {
        res.push(o);
      }
    }
    
    if (res.length > 300) break;
  }
  return res;
}

function addLogFast(u, r, t, d, p, ci) {
  try { ss.getSheetByName('Logs').appendRow([Utilities.formatDate(new Date(), "GMT+3", "dd.MM.yyyy HH:mm:ss"), u, r, p || "-", t, d, ci || "-"]); } catch(e){}
}

/* --- AUTHENTICATOR (TOTP) MATH --- */
function verifyTotp(s, c) {
  if (!s || !c) return false;
  const t = Math.floor(new Date().getTime() / 30000);
  for (let i = -1; i <= 1; i++) { if (getTOTPCode(s, t + i) === c) return true; }
  return false;
}
function getTOTPCode(s, ct) {
  const k = base32tohex(s);
  let hct = ct.toString(16).padStart(16, '0');
  const hmac = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, hexToBytes(hct), hexToBytes(k));
  const o = hmac[hmac.length - 1] & 0xf;
  const otp = ((hmac[o] & 0x7f) << 24 | (hmac[o+1] & 0xff) << 16 | (hmac[o+2] & 0xff) << 8 | (hmac[o+3] & 0xff)) % 1000000;
  return otp.toString().padStart(6, '0');
}
function generateBase32Secret() {
  const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let s = ''; for (let i = 0; i < 16; i++) s += ch.charAt(Math.floor(Math.random() * ch.length));
  return s;
}
function base32tohex(b) {
  let c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; let hex = "";
  for (let i = 0; i < b.length; i++) bits += c.indexOf(b.charAt(i).toUpperCase()).toString(2).padStart(5, '0');
  for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.substr(i, 4), 2).toString(16);
  return hex;
}
function hexToBytes(hex) {
  let b = []; for (let c = 0; c < hex.length; c += 2) b.push(parseInt(hex.substr(c, 2), 16));
  return b;
}

/* --- DİĞER STANDART İŞLEMLER --- */
function toggle2fa(targetUser, newStatus) {
  const sheet = ss.getSheetByName('Users'); const d = sheet.getRange("A:A").getValues();
  for (let i = 1; i < d.length; i++) { if (String(d[i][0]) === String(targetUser)) { sheet.getRange(i + 1, 7).setValue(newStatus); if(newStatus==='PASİF') sheet.getRange(i+1, 6).clearContent(); return successResponse({ status: 'success' }); } }
  return errorResponse("Bulunamadı.");
}
function getUserListDetailed(role, proj) { const data = ss.getSheetByName('Users').getDataRange().getValues(); return data.slice(1).filter(r => ['İK','IK'].includes(role) || r[3] === proj).map(r => ({ user: r[0], role: r[2], project: r[3], twoFactor: r[6] || 'PASİF' })); }
function addUser(u, p, r, pr, s) { const h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, p)); ss.getSheetByName('Users').appendRow([u, h, r, pr, "", "", s || 'PASİF']); return successResponse({status:'success'}); }
function deleteUser(u) { const s = ss.getSheetByName('Users'); const d = s.getRange("A:A").getValues(); for(let i=1; i<d.length; i++) { if(String(d[i][0])===String(u)) { s.deleteRow(i+1); return {status:'success'}; } } }
function resetUserPassword(u) { const s = ss.getSheetByName('Users'); const d = s.getRange("A:A").getValues(); const h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, '1234')); for(let i=1; i<d.length; i++) { if(String(d[i][0])===String(u)) { s.getRange(i+1, 2).setValue(h); return {status:'success'}; } } }
function updateRequestStatus(id, role, decision, rej) { 
  const s = ss.getSheetByName('Requests'); const d = s.getRange("A:A").getValues(); 
  let row = -1; for(let i=0; i<d.length; i++) { if(String(d[i][0]) === String(id)) { row = i+1; break; } } 
  if(row===-1) return errorResponse('ID Yok'); 
  let val = decision === 'Reddedildi' ? `Reddedildi: ${rej}` : decision; 
  if(role === 'TL') { 
    s.getRange(row, 10).setValue(val); // Sütun J
    s.getRange(row, 9).setValue(decision==='Onaylandı'?'spv_bekliyor':'red'); // Sütun I
  } else if(role === 'SPV') { 
    s.getRange(row, 11).setValue(val); // Sütun K
    s.getRange(row, 9).setValue(decision==='Onaylandı'?'ik_bekliyor':'red'); 
  } else { 
    s.getRange(row, 12).setValue(val); // Sütun L
    s.getRange(row, 9).setValue(decision==='Onaylandı'?'onaylandi':'red'); 
  } return successResponse({status:'success'}); 
}
function getLogs() { try { const d = ss.getSheetByName('Logs').getDataRange().getValues(); const l = []; for(let i=d.length-1; i>=Math.max(1, d.length-100); i--) l.push({time:d[i][0], user:d[i][1], role:d[i][2], project:d[i][3], type:d[i][4], detail:d[i][5], domain:d[i][6]}); return l; } catch(e) { return []; } }
function getSecretForUser(u) { const data = ss.getSheetByName('Users').getDataRange().getValues(); for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(u)) return data[i][5]; } }
function saveSecretForUser(u, s) { const sheet = ss.getSheetByName('Users'); const d = sheet.getRange("A:A").getValues(); for (let i = 1; i < d.length; i++) { if (String(d[i][0]) === String(u)) { sheet.getRange(i + 1, 6).setValue(s); break; } } }
function getUserBasicInfo(u) { const data = ss.getSheetByName('Users').getDataRange().getValues(); for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(u)) return { user: data[i][0], role: data[i][2], project: data[i][3] }; } }
function generateToken(u, r, p, fc) { const t = Utilities.getUuid(); CacheService.getScriptCache().put(t, JSON.stringify({user:u, role:r, project:p, forceChange: fc}), 21600); return t; }
function getSession(t) { const d = CacheService.getScriptCache().get(t); return d ? JSON.parse(d) : null; }
function successResponse(d) { return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON); }
function errorResponse(m) { return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: m })).setMimeType(ContentService.MimeType.JSON); }

function submitRequest(user, formData) {
  try {
    const sheet = ss.getSheetByName('Requests');
    const id = Date.now().toString();
    // Yeni Yapı (13 Sütun): ID, Kullanıcı, Ad Soyad, Proje, İzin Türü, Başlangıç, Bitiş, Gerekçe, Durum, TL, SPV, IK, Tarih
    sheet.appendRow([
      id, 
      user, 
      formData.fullName, 
      formData.project, 
      formData.type, 
      formData.start, 
      formData.end, 
      formData.reason, 
      "Bekliyor", 
      "Bekliyor", "Bekliyor", "Bekliyor", 
      Utilities.formatDate(new Date(), "GMT+3", "dd.MM.yyyy HH:mm")
    ]);
    return { status: 'success' };
  } catch(e) { return { status: 'error', message: e.toString() }; }
}
