// Utilitário de PDF padronizado do Oliver (usa jsPDF já carregado)
// A "marca" (nome/e-mail/telefone/cor) vem da empresa do usuário logado.
// É definida em window.oliverBranding (pelo app.html) e cacheada em localStorage.

// Marca efetiva, com fallback para o padrão Oliver.
function oliverMarca() {
    let b = window.oliverBranding;
    if (!b) {
        try { b = JSON.parse(localStorage.getItem("oliverBranding") || "null"); } catch (e) { b = null; }
    }
    b = b || {};
    return {
        nome: b.nome || "Oliver",
        email: b.email || "",
        telefone: b.telefone || "",
        cor: b.cor || "#F97316"   // laranja padrão
    };
}

// "#RRGGBB" -> {r,g,b}
function oliverHexRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || "").trim());
    if (!m) return { r: 249, g: 115, b: 22 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
// Escurece uma cor (fator 0..1) para a linha de detalhe
function oliverEscurece(c, f) {
    return { r: Math.round(c.r * (1 - f)), g: Math.round(c.g * (1 - f)), b: Math.round(c.b * (1 - f)) };
}
// Escolhe texto preto ou branco conforme a luminância da cor de fundo
function oliverTextoContraste(c) {
    const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return lum > 0.6 ? { r: 30, g: 30, b: 30 } : { r: 255, g: 255, b: 255 };
}

// Desenha um cabeçalho de marca e retorna a posição Y inicial do conteúdo.
window.oliverPdfHeader = function (pdf, titulo, subtitulo) {
    const marca = oliverMarca();
    const cor = oliverHexRgb(marca.cor);
    const txt = oliverTextoContraste(cor);
    const contato = [marca.email, marca.telefone].filter(Boolean).join("   —   ");
    const w = pdf.internal.pageSize.getWidth();
    const bandH = contato ? 30 : 26;

    // Faixa da cor da empresa
    pdf.setFillColor(cor.r, cor.g, cor.b);
    pdf.rect(0, 0, w, bandH, "F");
    // Linha de detalhe (tom mais escuro da mesma cor)
    const det = oliverEscurece(cor, 0.18);
    pdf.setFillColor(det.r, det.g, det.b);
    pdf.rect(0, bandH, w, 1.5, "F");

    // Nome da empresa (à esquerda)
    pdf.setTextColor(txt.r, txt.g, txt.b);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(String(marca.nome), 14, contato ? 13 : 17);
    // E-mail — telefone (abaixo do nome)
    if (contato) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.text(contato, 14, 21);
    }

    // Título do documento (à direita)
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(String(titulo || ""), w - 14, contato ? 13 : 13, { align: "right" });
    if (subtitulo) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.text(String(subtitulo), w - 14, contato ? 20 : 19, { align: "right" });
    }

    // Reset para o conteúdo
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "normal");
    return bandH + 12;
};

// Carimba um rodapé em todas as páginas.
window.oliverPdfFooter = function (pdf) {
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    const total = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
        pdf.setPage(i);
        pdf.setDrawColor(225, 225, 225);
        pdf.setLineWidth(0.3);
        pdf.line(14, h - 14, w - 14, h - 14);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text("Relatório gerado no OliverApp - Dúvidas e sugestões: WhatsApp (51) 98928-6351   https://olivewar.vercel.app/", 14, h - 9);
        pdf.text("Pág. " + i + "/" + total, w - 14, h - 9, { align: "right" });
    }
    pdf.setTextColor(0, 0, 0);
};
