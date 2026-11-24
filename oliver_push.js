// Notificações push (PWA) via Firebase Cloud Messaging.
// Fluxo: pede permissão -> pega o token FCM do aparelho -> salva em usuarios/{uid}/push_tokens/{token}.
// O backend (firebase-admin) envia para esses tokens; o service worker (sw.js) exibe a notificação.
import { getMessaging, getToken, deleteToken, isSupported } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";
import { doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 👉 COLE AQUI a CHAVE PÚBLICA VAPID:
//    Firebase Console → Configurações do projeto → Cloud Messaging → "Certificados push da Web" → Gerar par de chaves.
export const VAPID_PUBLIC_KEY = "";

// Estado atual: "nao-suportado" | "default" (ainda não pediu) | "granted" | "denied"
export function estadoPush() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return "nao-suportado";
    return Notification.permission;
}

// Ativa as notificações para este aparelho/usuário. Retorna true se deu certo.
export async function ativarPush({ db, uid }) {
    if (!VAPID_PUBLIC_KEY) {
        alert("As notificações ainda não foram configuradas (falta a chave VAPID). Avise o suporte.");
        return false;
    }
    let suportado = false;
    try { suportado = await isSupported(); } catch (e) { suportado = false; }
    if (!suportado || estadoPush() === "nao-suportado") {
        alert("Este navegador/dispositivo não suporta notificações push.\n\nNo iPhone, instale o app na tela inicial primeiro (iOS 16.4+).");
        return false;
    }
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
        alert("Permissão de notificações não concedida.");
        return false;
    }
    try {
        const reg = await navigator.serviceWorker.ready;
        const messaging = getMessaging();
        const token = await getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: reg });
        if (!token) { alert("Não foi possível gerar o token de notificação. Tente novamente."); return false; }
        await setDoc(doc(db, "usuarios", uid, "push_tokens", token), {
            token,
            plataforma: navigator.userAgent.slice(0, 180),
            criadoEm: new Date().toISOString()
        }, { merge: true });
        try { localStorage.setItem("oliverPushToken", token); } catch (e) {}
        return true;
    } catch (e) {
        console.error("ativarPush:", e);
        alert("Falha ao ativar notificações: " + (e && e.message ? e.message : e));
        return false;
    }
}

// Desativa neste aparelho (remove o token).
export async function desativarPush({ db, uid }) {
    try {
        const messaging = getMessaging();
        const token = localStorage.getItem("oliverPushToken") || "";
        if (token) { try { await deleteToken(messaging); } catch (e) {} await deleteDoc(doc(db, "usuarios", uid, "push_tokens", token)); }
        try { localStorage.removeItem("oliverPushToken"); } catch (e) {}
        return true;
    } catch (e) { console.error("desativarPush:", e); return false; }
}
