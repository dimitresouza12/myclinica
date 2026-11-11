// Imagens de referência do faceograma e do corpograma (WebP). Cada vista tem a versão completa (tela cheia),
// a -sm (tela normal e celular) e uma miniatura de 32 px embutida (data URI) que aparece borrada até a -sm carregar.
// Os nomes são novos (public/faceograma e public/corpograma): nenhum navegador tem a versão antiga em cache.

export interface RefImage { src: string; sm: string; tiny: string; w: number; h: number }

export type BodySex = 'fem' | 'masc'
export type BodyView = 'frente' | 'costas'

/** Rosto de frente (as zonas e coordenadas do faceograma estão calibradas para esta vista). */
export const FACE_FRONT: RefImage = {
  src: '/faceograma/rosto-frente.webp', sm: '/faceograma/rosto-frente-sm.webp',
  tiny: 'data:image/webp;base64,UklGRvYBAABXRUJQVlA4WAoAAAAQAAAAHwAAGgAAQUxQSLkAAAARV6CgbRs2VA7dvxERuDbu/NDgtrb2tJHsBdhunSopGVpOzVBy0jKVDD0vkEhjRr9ke4OI/jNw27YRu2+f+wsEi6oicYkMGrqQc3q/x7LIlFD6CQood/ovbSzwZbYCzo+5Sbww8JEFiJsMZAieRUEJ8nZQiDeBbF4ZHrYE/w1zkL3nhPZMGgl0CDwjCgrGIA7yJvkRcVsoM0IpLWG+9eA+JFUwC/ReMKdrUcMIhQfLFVdGbPMVVVgwAgBWUDggFgEAALAGAJ0BKiAAGwA+7WKsUCmlJCKwGAgBMB2JbACsMy/6gNJ2zylKB8TQaLZIfcb+9/QyXthMsp+b7WdL6PYwAP7wy35FasNC/h/scPUXd/kgNcin7i5Fn+FCltfKbqUjBYIdAOxxbPP3i8O0Cad4FQ2+aHyUKNki6adQig9rcjAqQfwImibN5Dj2D2uV9CxxeRDo119UYtQi+qq9rXOaBLvke+kqiPbUVOLEfSjQRd26r0gKqByker5eVZl8Rf71x/lkPuIrSB+zxPaFtJr+OnpGxFtf4bdfwa2SS/Ppd+XkJ34JpOODCL/ALCV9TXQ3305VJrJB0bdsiUozvJFA/EgYIF51CoRr4JOpkmDgQyaDV5MFGYAA',
  w: 2000, h: 1662,
}

export const BODY_IMAGES: Record<BodySex, Record<BodyView, RefImage>> = {
  fem: {
    frente: { src: '/corpograma/corpo-fem-frente.webp', sm: '/corpograma/corpo-fem-frente-sm.webp', w: 1342, h: 2000,
      tiny: 'data:image/webp;base64,UklGRu4CAABXRUJQVlA4WAoAAAAQAAAAHwAALwAAQUxQSEUBAAARV6CgbRsWF8TdiYjAzP1d5wg42v61bZB0AdRXd3uUnCaP6cnYE43u9pgeZXS314bDBWL+15T0J0eI6P8EkP/OGhL0/UrBZVikSuwWGs6Topu+IrEKcTS76RsKxv8Q/MlC0JEA4FcKYgMAEGH+Yj9qWiZhgfC2AoD/amnHcwYQMTut/rwGCEdu2jBYAVwPgxS6rsReQyWFldYA4W2UkpnlGcBPdaYm+b3qDmBhjs2km+BYAHDr1U6gI+cmZtevlJi/tesx52ZuJcysF8EFuMezBO9Le4GIgZv5MmOZfaUuIsZdeqrGiE7qor/hDtFJ6rEIV9wmSE9cL7mFyexqy4WGoaw2XKi4YBApuPKrjFufq5jM1q3PNYkXqfpcxVBm30S4iXXcU1Bj03vGjbSMlHclYXnPqMzU9L5VjP+o0LaJoTohupIAAFZQOCCCAQAA0AcAnQEqIAAwAD7hXKZNqKUjojANURAcCWwAtvsbQYlmJEbIMRkAOuPSH3rHimv+TI9G+ZN3Vw6yAcbbLYWe9thgxiZmf0AA/vvdLSN+3/jOASHjdo4UK6tSCYJvuDKrpGphcLqw0ifH04XSwlMh82Pa2UqfZrOk6i0L2H0VuIXBK48jkBY8oD8Ng0CSZQBmO/+WyPsleaAVtDlehqHpip3PvaOFQOfs9+hfwfa3bShimdW0tEKasRET+YIIQIzISfguwS5NB8mTfxD+3SeXx9Ywt68WTynDPPJLLyL9MNxGhSWPBgB8+LUL1APOS9WRQTKc4VdjwrNYyxwxSBLKPZPoWNn/0aw85NNxihg+sjjnfuXRVaOUqxg4mL+BE6JQT0hS4kUZ1P9Iwb6W2tPo+2lShaz6P5bL5MgWCx2DwAWqTYBdEUkSumXHrxFe35st39NWHBphrPv0uOYpKDoKq4rgoQkSkrpFSVi955umW6Nlq9O329pHquZ9CFjON/AAAAA=' },
    costas: { src: '/corpograma/corpo-fem-costas.webp', sm: '/corpograma/corpo-fem-costas-sm.webp', w: 1342, h: 2000,
      tiny: 'data:image/webp;base64,UklGRt4CAABXRUJQVlA4WAoAAAAQAAAAHwAALwAAQUxQSEIBAAARV6CgbRsWF8XdiYhAfPmhasDR9j9tI8kXYHsNJyPTWG5Hbj2W2zEMIyddw7qArf81bf/VI0T0fwLIf8d1CXV6TXEx749J+H8KLi+l7kZUYuvi1PjuV6eYQlfwZxOhTgUAv6aIHQDAEOMF/lhUzJfJHwUAHJWok5UH8Le3ol7dLYC7daIm9Q3AzaQeoW5zgZZLI3aZLYB7N4yILZMewKi4ZGGFn6IPwJMzI+y2fiIAuDmxQtSpfRuwXq9poHCwXgUAOLcrM8xsAheQPQnL95UmjDzIxvpGIFamTRjtwVHPWIBo5FX87rhNNBJ5K9wttwjyRNxsuImJ+Y01VzCq11j/MdS+MR5S1C7Xktg7r7jYwX5dMZTvNI+KDMcd7NcVw6g763ZIUTPz5Ac3VfIvUtcSZgEXm5v5H4b6ZLEnFNEI0UgoVlA4IHYBAADQCACdASogADAAPu1gqk2ppaQiMBVdUTAdiWgAt+ttSIUgI4F0salKuhuxtNBbxWFRcqcS/9aTyfZ7+0uWn4FvCYrPtRYKcrLKOwI0fKOAAP766u8ce9yuf63tF6BFeSYX9BudTt9NL0cmT0+4PyV5uoPyTlNldx5xmOxguR9GEa92jny+ZcePf96xWxffmHVMIlBA3dAA+ZDRdZ01dr/7GxkLOmvgEeInQtiMBOVAwnIRvTNtkOYW6d93y/RUU0CqxTp2W646WwktWQ5Mk5pUw8sxJYvA6z9gQS2vZ95jDzRDJyI4Pbnh3rwwnzTiMP+LkP5jCdumVIYCWgoEAORBxFKoDm2k29tjH+NX79xG4Wg2apsWpU0oRXpw5+uIY5Ou1nw3pdLTrsWCGPVv+jW41L7Cb9DHir4bgKVmjVaMbBSDnB8gQZpU8Ss6R2Ovq0AXzEnnOepSl4MZlrayQ74E6xr98oKo4obaCg9bs/E1ncDUYHgAAA==' },
  },
  masc: {
    frente: { src: '/corpograma/corpo-masc-frente.webp', sm: '/corpograma/corpo-masc-frente-sm.webp', w: 1342, h: 2000,
      tiny: 'data:image/webp;base64,UklGRuoCAABXRUJQVlA4WAoAAAAQAAAAHwAALwAAQUxQSD4BAAARV6CgbRs2VBJnfxERUNW045uAo+1/2ka2LyDHkJVhtMsdGcZwMpbbkVutYXkN2I9OEP2vaenv9gYR/Z8A8tfFXAY6uTZwhZibuGAbWf9TiJmJo+uhgaJhzBwDczqT4qWCoDMJIF4MXWELABBZukCmhKMLVa6uqfJ0t1wCiCSvex/GAGzd0NDV0RrgdXxjaDaN1DvTFJLaBoC1uKkKFuUYgO0sHNXJS3ELEOWmnuruSOG81xV04ocSQDjNgZEKE+8k5Ta5q1i4TSmk8E4WiuDHakqeCL/w46QKe0ZT8lj49MxMEZs0JdsIj9hEeyKHa+ERZChvVsLFFLbHy8jC0PhoxExcY8QMXP0ti3/LTUwhyWd741aGW25iaOw1M8zck18DNXWCF9zEKgwyOMH/FOZO8Gthwp5BHx0MtQmxDQVWUDgghgEAAJAIAJ0BKiAAMAA+7WKnTqmlIyIwFV1RMB2JagC+e5M/XhLZj8aA2i1p9ey836B8uHcV7mUJddhyqWTdFFRQf9+Q8K0RNSzGqwdic0zwAP77aa6DaArXjyBn+mYlfdnXPOX7iWHxPaZEeGEob2RKS9Q2GkaoANyc2nWMGjD+FhvtvChZ0KFHWc83vYmyPd3vf22vSutqHErl96i6o381rWAla1+q7liN1JF7tq5VNKX2FSBYJkPeAXUEb+cMlV+o8/zsZuWfA+JRI3YvaWO2uPBxlOCQvnZQj6iZWiDU8/cD6JmF9AG8jNCAgP/ischhVIlL5AI3EnJZK6XH9bT8BfLEMbhHbTgO/ESE2opEs7f89d+3j9Ei+kuG6qGGm230gNU+X+QDrZj77/BOVCfEnZN8/RqwaMqbQqwLrl7SmlNjTKHDAr3SXABvKEAcrh4oMr9TJRTM+RCS76/PWC5yv6v8peMrzUr+S08adcFAsvMKkPa7EPsFsb6sAz4eQhDWf8BLtzFUAA==' },
    costas: { src: '/corpograma/corpo-masc-costas.webp', sm: '/corpograma/corpo-masc-costas-sm.webp', w: 1342, h: 2000,
      tiny: 'data:image/webp;base64,UklGRuYCAABXRUJQVlA4WAoAAAAQAAAAHwAALwAAQUxQSD8BAAARV6CgbRs2VBJnfxER0ORlxCcBR9u/to1AF0DVK04f5W6P6cmoTPaYnow9YXWXVhf0cALxv6bEX8kNIvo/AdZf190KbHpFcFwKiovy1P4fLgXFsc2IoFhDCo9gTuZavewh2FwDqFdi4jkAQGqbGrqgvEq+KS4LTLeJBlBZzTQeSQCxOTKwdX8D8Dq5JgZ5WHgXBp4dbAFebxJaFi13JYBoLr2y42E9B0jdWVB21y/x3g9L2DRsaADlxUNSOM6C44IfJ36hsfRjrbQKjpcl0Y8d6yRTIf/xCrxNYp1IFbJTWrAcK9ZiqwLLsYzHerRRgYVs6Ou18jE8H6xSG8NkfyIo7mgsCO7wrUp4KyiGZ+Ftgoqy2ltiY/gfhLcJxTAZHAuCmvuNF9zM5kPctJrXwPGF1/ilmOjJ5k8ehjnEckgJAFZQOCCAAQAA8AcAnQEqIAAwAD7pXqhNqSUkIjVUDAEgHQlqALfndaubQSm+FvcfaNPaP6OFOGTQVQ3vG9TNWBDgCIcEyH5EKPf2M7dbGxCQAP75EPnFq5rhl1ONwxH9tOX4YWEXo5pX/FqbooqTCI4jjfnJowXFaIKbd1a+sVAOjubBGZs/6BotfN5HBs94dXNhzJyAQIm1xqI0HmvkU8F4aXgNCtAuNgFiUkpsgYedm46mX0j2Ahiz0P6+FfwVbjoD1pxcCO/xczrAuoiXbObOnCOgOBZcoI3z3TP2bKihag3dnVMACWW+agr+lyFAj1ZtxlAqfaJZX+rHuWwHrAYvhu9BcRPIBAATl7sWDmhcZ9gG4o9C7+g2xSetz1/u/7Vnfeqw/hIpiHFHcVXnYwgSPTJzZ9MdBk9zDcR+2VXVI+KL4F99jsOofBvq5ZbodrxCCGu5qQvs2va0E1k3ncPifS68+OZsQxe1mApImQgxnhgn3vq+rJKX33oDNnpjY31JCpiC7EAA' },
  },
}

/** Qual figura usar pelo gênero do cadastro: "Masculino" usa a masculina; feminino, outro valor ou vazio usa a feminina. */
export function bodySexFor(gender: string | null | undefined): BodySex {
  return (gender ?? '').trim().toLowerCase() === 'masculino' ? 'masc' : 'fem'
}
