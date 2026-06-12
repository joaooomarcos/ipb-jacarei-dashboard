#!/usr/bin/env python3
"""Gera data.json a partir do export CSV da aba Membros (e opcionalmente Exclusões).

Replica a lógica do Codigo.gs para testar o dashboard localmente:
  python3 scripts/gen_data.py "Membros.csv" ["Exclusoes.csv"]
"""
import csv, json, sys, datetime, unicodedata

# Índices das colunas (A=0). Exclusões tem as mesmas + AO..AS (40..44)
IGREJA, SEXO, COMUNGANTE, STATUS, NEC_ESP = 1, 3, 4, 5, 6
DT_NASC, IDADE, DT_INC, MOTIVO = 7, 8, 11, 12
CIDADE, ESCOLAR, EST_CIVIL, FILHOS, ORIGEM = 25, 30, 31, 33, 35
EXC_MOTIVO, EXC_DT_FALEC, EXC_DT_ALT = 40, 42, 44

IGREJAS = ["Central", "Villa Branca", "Nova Esperança"]
FAIXAS = ["0–12", "13–17", "18–29", "30–44", "45–59", "60+"]
HOJE = datetime.date.today()


def ler(path):
    if not path:
        return []
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))[1:]
    return [r for r in rows if any(c.strip() for c in r)]


def cel(r, i):
    return r[i].strip() if i < len(r) else ""


def idade(r):
    v = cel(r, IDADE)
    if v.isdigit() and int(v) > 0:
        return int(v)
    try:
        d, m, a = cel(r, DT_NASC).split("/")
        nasc = datetime.date(int(a), int(m), int(d))
        return (HOJE - nasc).days * 4 // 1461
    except Exception:
        return 0


def ano(r, col):
    try:
        a = int(cel(r, col).split("/")[-1])
        return a if 1900 < a <= HOJE.year else None
    except Exception:
        return None


def faixa_idx(i):
    return 0 if i <= 12 else 1 if i <= 17 else 2 if i <= 29 else 3 if i <= 44 else 4 if i <= 59 else 5


def conta_campo(rows, col):
    counts = {}
    for r in rows:
        v = cel(r, col)
        if v:
            counts[v] = counts.get(v, 0) + 1
    return [{"label": k, "valor": v} for k, v in sorted(counts.items(), key=lambda kv: -kv[1])]


def bloco(membros, exclusoes):
    """Calcula todos os agregados para um conjunto de linhas (geral ou uma igreja)."""
    ativos = [r for r in membros if cel(r, STATUS) == "Ativo"]
    com = [r for r in ativos if cel(r, COMUNGANTE) == "Sim"]
    ncom = [r for r in ativos if cel(r, COMUNGANTE) != "Sim"]
    inativos = [r for r in membros if cel(r, STATUS) != "Ativo"]

    idades = [i for i in (idade(r) for r in ativos) if i > 0]
    media = round(sum(idades) / len(idades)) if idades else 0

    def bucket(rows):
        b = [0] * 6
        for r in rows:
            i = idade(r)
            if i > 0:
                b[faixa_idx(i)] += 1
        return b

    # Inclusões por ano, separadas por tipo (apenas ativos)
    anos_inc = {}
    for tipo, rows in (("c", com), ("n", ncom)):
        for r in rows:
            a = ano(r, DT_INC)
            if a:
                anos_inc.setdefault(a, {"c": 0, "n": 0})[tipo] += 1
    anos_sorted = sorted(anos_inc)

    # Fluxo: entradas (todos os registros, inclusive inativos e excluídos) × saídas,
    # cada um separado por comungante [0] / não comungante [1]
    entradas, saidas = {}, {}
    for r in membros + exclusoes:
        a = ano(r, DT_INC)
        if a:
            entradas.setdefault(a, [0, 0])[0 if cel(r, COMUNGANTE) == "Sim" else 1] += 1
    for r in exclusoes:
        a = ano(r, EXC_DT_ALT) or ano(r, EXC_DT_FALEC)
        if a:
            saidas.setdefault(a, [0, 0])[0 if cel(r, COMUNGANTE) == "Sim" else 1] += 1
    anos_fluxo = sorted(set(entradas) | set(saidas))
    zero = [0, 0]

    return {
        "comungantes": len(com),
        "nao_comungantes": len(ncom),
        "a_parte": len(inativos),
        "exclusoes": len(exclusoes),
        "media_idade": media,
        "sexo": {
            "masculino": sum(1 for r in ativos if cel(r, SEXO) == "Masculino"),
            "feminino": sum(1 for r in ativos if cel(r, SEXO) == "Feminino"),
        },
        "faixas": {"labels": FAIXAS, "comungantes": bucket(com), "nao_comungantes": bucket(ncom)},
        "crescimento": {
            "anos": anos_sorted,
            "comungantes": [anos_inc[a]["c"] for a in anos_sorted],
            "nao_comungantes": [anos_inc[a]["n"] for a in anos_sorted],
        },
        "fluxo": {
            "anos": anos_fluxo,
            "entradas": [sum(entradas.get(a, zero)) for a in anos_fluxo],
            "entradas_c": [entradas.get(a, zero)[0] for a in anos_fluxo],
            "entradas_n": [entradas.get(a, zero)[1] for a in anos_fluxo],
            "saidas": [sum(saidas.get(a, zero)) for a in anos_fluxo],
            "saidas_c": [saidas.get(a, zero)[0] for a in anos_fluxo],
            "saidas_n": [saidas.get(a, zero)[1] for a in anos_fluxo],
            "saldo": [sum(entradas.get(a, zero)) - sum(saidas.get(a, zero)) for a in anos_fluxo],
        },
        "motivos": conta_campo(ativos, MOTIVO),
        "motivos_saida": conta_campo(exclusoes, EXC_MOTIVO),
        "civil": conta_campo(ativos, EST_CIVIL),
        "escolaridade": conta_campo(ativos, ESCOLAR),
        "origem": conta_campo(ativos, ORIGEM),
        "filhos": conta_campo(ativos, FILHOS),
        "cidades": conta_campo(ativos, CIDADE),
        "nec_esp": [
            {"label": "Sem nec. especiais", "valor": sum(1 for r in ativos if cel(r, NEC_ESP).lower() not in ("sim", "s"))},
            {"label": "Com nec. especiais", "valor": sum(1 for r in ativos if cel(r, NEC_ESP).lower() in ("sim", "s"))},
        ],
    }


def main():
    membros = ler(sys.argv[1])
    exclusoes = ler(sys.argv[2]) if len(sys.argv) > 2 else []

    geral = bloco(membros, exclusoes)
    por_igreja = {}
    igrejas = []
    for nome in IGREJAS:
        m = [r for r in membros if cel(r, IGREJA) == nome]
        e = [r for r in exclusoes if cel(r, IGREJA) == nome]
        b = bloco(m, e)
        por_igreja[nome] = b
        igrejas.append({"nome": nome, "comungantes": b["comungantes"], "nao_comungantes": b["nao_comungantes"],
                        "a_parte": b["a_parte"], "exclusoes": b["exclusoes"]})

    out = {
        "atualizado_em": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "resumo": {k: geral[k] for k in ("comungantes", "nao_comungantes", "a_parte", "exclusoes", "media_idade")},
        "igrejas": igrejas,
        **{k: geral[k] for k in ("sexo", "faixas", "crescimento", "fluxo", "motivos", "motivos_saida",
                                  "civil", "escolaridade", "origem", "filhos", "cidades", "nec_esp")},
        "por_igreja": por_igreja,
    }
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
