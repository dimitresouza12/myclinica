-- Meta de faturamento mensal, definida pelo admin da clínica na aba "Metas"
-- (Relatórios) e usada como linha de referência no gráfico do dashboard.
alter table public.clinics add column if not exists monthly_revenue_goal numeric null;

comment on column public.clinics.monthly_revenue_goal is
  'Meta de faturamento mensal definida pelo admin da clínica; usada na aba Metas (Relatórios) e como linha de referência no gráfico do dashboard.';
