# Imagens do odontograma

As três vistas do odontograma (`public/odontograma/`) saem destas imagens geradas por IA:

- `frente-original.jpg`: as duas arcadas de frente (fundo quadriculado "desenhado", recortado pelo script).
- `superior-original.jpg` e `inferior-original.jpg`: vistas de mastigação, 16 dentes cada, fundo verde.

Para cada vista o app usa a imagem (`.webp`, fundo transparente) e um mapa de dentes (`-dentes.png`, em tons de
cinza: o valor do pixel é o número FDI do dente, 0 fora). O mapa diz qual dente foi clicado e onde pintar a condição.

Para refazer depois de trocar uma imagem (precisa de Python com Pillow, NumPy e SciPy):

```bash
cd docs/odontograma && python3 1_vistas_de_cima.py && python3 2_frente_mascara.py && python3 3_gerar_public.py
```

- As vistas de cima são separadas sozinhas (centro de cada dente e "gargalos" entre eles). Confira `tmp-*_preview.png`.
- Na frente os dentes se sobrepõem, então as divisas entre eles são posições x fixas em `3_gerar_public.py`
  (`bounds`), medidas nesta imagem. Trocou a imagem de frente: meça de novo.
- Lado esquerdo da imagem = lado direito do paciente, em todas as vistas.

## 4_frente_refinar.py
Roda depois do `3_gerar_public.py`. Troca as faixas retas do mapa da frente por limites que seguem a borda real de cada dente
(os dentes se sobrepõem na foto e o destaque vazava para o vizinho). Os dentes de trás (47, 46, 45, 35, 36, 37) usam sementes
marcadas à mão no dicionário `MANUAL`; se trocar a imagem de frente, reajuste essas coordenadas.
