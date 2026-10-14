<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:project-memory -->
# Memória do projeto (cérebro Obsidian)

Este projeto tem uma base de conhecimento persistente **fora do repo**, num vault Obsidian:

```
/Users/dimitre/Library/CloudStorage/GoogleDrive-dimitresouza12@gmail.com/Meu Drive/Cérebro IA/MyClinica/
```

Ela existe para o contexto sobreviver entre ferramentas (Claude Code, Codex, o que vier depois) e entre sessões — nenhuma delas tem memória própria persistente do projeto, então essa pasta é a fonte combinada.

- **No início de uma tarefa não trivial**, ler `00 MyClinica.md` dessa pasta antes de assumir o estado do sistema. Ele tem status por frente (segurança, UX mobile, features em andamento) mais atual do que qualquer suposição feita só a partir do código ou de treino.
- **Ao final de uma sessão que mudou algo relevante** — corrigiu um bug real, tomou uma decisão de produto, achou a causa raiz de um problema, ou deixou algo pendente de aprovação — registrar uma entrada em `Log de Sessões.md` na mesma pasta (data, ferramenta usada, o que mudou, o que ficou pendente) e atualizar a nota temática correspondente (`Segurança — Achados e Remediação`, `UX Mobile — Auditoria e QA`, `Planos e Decisões de Produto`, `Modelos de Documento — Calibração`, ou `Arquitetura e Stack`) se o fato que ela descreve mudou.
- Não é para toda interação pequena — é para o que a próxima sessão, com outra ferramenta ou noutro dia, precisaria saber para não redescobrir ou repetir trabalho.
- **Nunca tratar o vault como fonte de verdade do código** — ele registra decisões, achados e estado de produto; o código e o banco (via `execute_sql`) são sempre a fonte de verdade sobre o que está implementado agora.
<!-- END:project-memory -->
