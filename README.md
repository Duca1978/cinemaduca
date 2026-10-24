# Cinema Duca

Entidade de entretenimento da GTA7 Lab. Primeira versão somente de consulta, com dados fictícios em `data/cinema.json` e datas fixas de demonstração. Não implementa reservas, pagamentos ou autenticação.

## Executar

Node.js 22 ou superior (validado com Node 24).

```sh
npm ci
npm run typecheck
npm test
npm run dev
```

O servidor usa a porta 3000; `PORT` permite trocar a porta. A interface apresenta filmes, filtros por título/gênero, sessões, preços e assentos disponíveis. Não exige variáveis secretas ou serviços externos. Modifique o JSON para atualizar o catálogo e reinicie o servidor.

## API e MCP

- `GET /api/movies?query=orbita&genre=ficcao`: catálogo filtrado, busca sem distinção de acentos/maiúsculas.
- `GET /api/sessions?movieId=orbita&date=2026-10-24`: sessões e assentos disponíveis.
- `GET /api/manifest`: identificação e capacidades para o Core.
- `/api/mcp`: MCP Streamable HTTP, sem autenticação, usando o SDK oficial; cada requisição é independente.

Ferramentas MCP: `search_movies({ query?: string, genre?: string })` retorna `{ movies: [...] }`; `get_sessions({ movieId?: string, date?: string })` retorna `{ sessions: [...] }`. Ambas retornam conteúdo JSON e `structuredContent`. Nenhuma ferramenta altera dados.

Para o Core Orchestrator, registre o manifesto e configure o cliente MCP Streamable HTTP com a URL pública terminada em `/api/mcp`. O protocolo trata inicialização e descoberta via `tools/list`; o teste de integração fornece um exemplo com o cliente oficial. A conexão com o Core real depende de sua URL e configuração e ainda não foi validada.

## Vercel

Importe o repositório na Vercel, selecione **Other** como framework e Node.js 24.x. Não há build da interface: ela está em `public/`. Deixe Build Command sem comando e configure Output Directory como `public`. `vercel.json` encaminha `/api/*` para a função TypeScript e inclui o JSON no pacote. O SDK MCP é a dependência de runtime; `tsx`, TypeScript e os tipos são ferramentas de desenvolvimento.

A publicação requer uma conta/projeto Vercel. Nenhum deploy foi realizado durante a preparação. Depois do deploy, confira a página, `/api/manifest` e uma chamada MCP antes de cadastrar no Core.

## Verificação

`npm test` testa filtros, disponibilidade, respostas HTTP e um cliente MCP real: inicialização, descoberta, execução das duas ferramentas e rejeição de data inválida. Não existe banco nem estado gravável; reinícios mantêm os mesmos dados de demonstração.
