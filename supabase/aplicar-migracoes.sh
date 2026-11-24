#!/usr/bin/env bash
# Aplica no banco de produção as migrações da lista PENDENTES, em ordem, e anota cada uma numa tabela
# de controle (public._migracoes_aplicadas) para nunca rodar a mesma duas vezes.
#
# Uso (uma vez por lote, no terminal):
#   export SUPABASE_DB_URL='postgresql://postgres:SENHA@db.siohvtgbomvcprbzfamr.supabase.co:5432/postgres'
#   ./supabase/aplicar-migracoes.sh            # aplica as pendentes
#   ./supabase/aplicar-migracoes.sh --listar   # só mostra o que falta, sem aplicar
#
# A URL está em Supabase > Project Settings > Database > Connection string (use a senha do banco).
# Cada arquivo roda numa transação única (--single-transaction): se der erro, nada daquele arquivo fica pela metade
# e o script para ali.
#
# Para cada lote novo, acrescente os arquivos ao fim de PENDENTES. Os que já constam como aplicados são pulados.

set -euo pipefail
cd "$(dirname "$0")/migrations"

PENDENTES=(
  20261120_chat_equipe_indices.sql
  20261121_chat_equipe_fase2.sql
  20261127_pacientes_storage_por_clinica.sql
  20261128_agendamento_online.sql
  20261129_nutri_recordatorio.sql
  20261130_fisio_exercicios_goniometria.sql
  20261131_odonto_periograma_orto.sql
  20261133_medicina_exames_receita.sql
)

: "${SUPABASE_DB_URL:?Defina SUPABASE_DB_URL (veja o cabecalho deste arquivo)}"
PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -c "create table if not exists public._migracoes_aplicadas (name text primary key, applied_at timestamptz not null default now()); alter table public._migracoes_aplicadas enable row level security;"

for f in "${PENDENTES[@]}"; do
  feito=$("${PSQL[@]}" -tA -c "select 1 from public._migracoes_aplicadas where name = '$f'")
  if [[ "$feito" == "1" ]]; then echo "ja aplicada: $f"; continue; fi
  if [[ "${1:-}" == "--listar" ]]; then echo "falta:       $f"; continue; fi
  echo "aplicando:   $f"
  "${PSQL[@]}" --single-transaction -f "$f"
  "${PSQL[@]}" -c "insert into public._migracoes_aplicadas (name) values ('$f')"
  echo "ok:          $f"
done
echo "fim."
