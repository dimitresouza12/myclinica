# Sigilo de psicologia em record_entries (contrato para o frontend)

Migration: `supabase/migrations/20261111_record_entries_confidential.sql` (ainda NÃO aplicada em produção; depende de aprovação do dono).

## Contrato

Tabela `public.record_entries`, duas colunas novas:

| Coluna | Tipo | Regra |
|---|---|---|
| `is_confidential` | `boolean NOT NULL DEFAULT false` | `true` = anotação sigilosa: só o autor e o superadmin leem. `false` = como hoje. |
| `author_user_id` | `uuid NULL` | `auth.users.id` de quem gravou. O banco preenche sozinho no INSERT (gatilho); o front não precisa enviar e não consegue forjar. Nulo nas entradas antigas. |

- Gravar nota sigilosa: `supabase.from('record_entries').insert({ ...campos_atuais, is_confidential: true })`. Não enviar `author_user_id`.
- Ler: `select('*')` continua igual. A RLS remove sozinha as notas sigilosas de outros autores; o resultado simplesmente não traz essas linhas (sem erro). Não filtrar no cliente.
- `insert(...).select()` de uma nota sigilosa funciona para o autor.
- Entradas existentes ficam `is_confidential = false` e continuam visíveis a quem já as vê hoje.
- Imutável: não há UPDATE/DELETE em `record_entries`, então não dá para marcar/desmarcar depois. A decisão é na hora de salvar.
- Tipo TS a acrescentar em `RecordEntry` (`src/types/index.ts`): `is_confidential: boolean` e `author_user_id: string | null`.

## Sugestão de UI (decisão do frontend/dono)

Na `TabTimeline`, quando a área ativa for `psico`, um toggle "Anotação pessoal sigilosa (CFP)" ao lado do botão de salvar, e um selo discreto (sem emoji) nas entradas com `is_confidential`. O padrão do toggle deve ser desligado (conservador: nada muda sem ação do psicólogo).

## Decisões de produto tomadas (as mais conservadoras)

1. Nenhuma entrada antiga é marcada sigilosa. Só entradas novas, por escolha do autor.
2. Admin da clínica NÃO lê nota sigilosa de outro (só o superadmin do sistema). Se o dono quiser que o admin da clínica também leia, é preciso incluir `get_my_role() = 'admin'` na policy.
3. Qualquer profissional pode marcar uma nota como sigilosa, não só psicólogo; a restrição por área fica no frontend.
4. Imutável após criar (consistente com o prontuário imutável).

## Fora do escopo desta migration (limites)

- `medical_records.anamnesis['psico']` (a ficha de anamnese psicológica) continua legível por quem tem acesso ao prontuário. Cobrir isso exige tabela própria ou coluna separada; fica como próxima etapa.
- Fotos/arquivos anexados a uma nota sigilosa ficam no bucket com as regras do bucket (não herdam a policy).
- Service role (n8n, chaves de serviço) ignora RLS. Hoje nenhuma rota do app lê `record_entries` com service role.
- `patient_visible_to_my_area` (SECURITY DEFINER) continua considerando todas as entradas para decidir visibilidade do paciente por área; não vaza conteúdo.
