// Avisa a consultoria (consultores responsáveis) sobre uma ação do cliente.
// Uso: import { avisarConsultoria } from "./oliver_notificar.js";
//      avisarConsultoria("lançou uma despesa de R$ 50", "fluxo_caixa.html");
// É best-effort e não bloqueia nada: se falhar, apenas ignora.
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export async function avisarConsultoria(acao, url) {
    try {
        const user = getAuth().currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        fetch("/api/notificar-atividade", {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ acao: acao || "atualizou algo no Oliver", url: url || "admin_atividades.html" })
        }).catch(() => {});
    } catch (e) { /* silencioso */ }
}
