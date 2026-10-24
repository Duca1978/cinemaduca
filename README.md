# Cinema Duca

Entidade de entretenimento da GTA7 Lab. Catálogo de consulta e reservas simuladas pela interface e via MCP no servidor local, com dados fictícios em `data/cinema.json` e datas fixas de demonstração. Sem pagamentos ou autenticação de usuários. Na Vercel, apenas consultas; reservas em JSON ficam restritas à demonstração local.

## Executar

Node.js 22 ou superior (validado com Node 24).

```sh
npm ci
npm run typecheck
npm test
npm run dev
```

O servidor usa a porta 3000; `PORT` permite trocar a porta. Cada filme possui `protagonist` com nome, `imageUrl`, descrição acessível e identificação de imagem gerada por IA. Os retratos são de personagens fictícias, ficam em `public/images/` e são retornados por `search_movies` e `get_movie`. `imageUrl` é relativo à origem do servidor (na Vercel, use `https://cinemaduca.vercel.app` como base). Não há geração a cada consulta.

A interface apresenta filmes, filtros combináveis por título, gênero, ator/atriz e ano de lançamento, sessões, preços e assentos disponíveis. Não exige variáveis secretas ou serviços externos. Modifique o JSON para atualizar o catálogo e reinicie o servidor.

## Reservar pela página

No servidor local, escolha os assentos abaixo de uma sessão e clique em **Reservar**. A página mostra o total antes de confirmar e o comprovante depois. Clique em **Cancelar reserva** no comprovante para liberar os assentos. A disponibilidade é atualizada sem recarregar a página.

Os comprovantes e códigos de cancelamento ficam neste navegador (`localStorage`) para sobreviver ao refresh. As reservas em si ficam no JSON do servidor. Em outro navegador, use **Cancelar reserva** e informe o número e o código guardados. Se o navegador bloquear o armazenamento, guarde manualmente os dados do comprovante antes de sair. Apagar os dados do navegador não cancela a reserva no servidor.

Na Vercel, os botões aparecem desativados com uma explicação; não simulam sucesso sem persistência.

## API e MCP

- `GET /api/movies?query=orbita&genre=ficcao&actor=caio&year=2026`: catálogo filtrado, busca sem distinção de acentos/maiúsculas.
- `GET /api/sessions?movieId=orbita&date=2026-10-24`: sessões e assentos disponíveis.
- `GET /api/manifest`: identificação e capacidades para o Core.
- `POST /api/reservations`: `{ sessionId, seats }`; responde 201 com reserva e código de cancelamento.
- `POST /api/reservations/cancel`: `{ reservationId, cancellationToken }`; responde com status cancelado.
- `/api/mcp`: MCP Streamable HTTP, sem autenticação, usando o SDK oficial; cada requisição é independente.

Ferramentas MCP (todas retornam JSON e `structuredContent`):

| Tool | Parâmetros | Resultado |
| --- | --- | --- |
| `search_movies` | `query?`, `genre?`, `actor?`, `year?` | `{ movies: [...] }` |
| `get_sessions` | `movieId?`, `date?` | `{ sessions: [...] }`, incluindo disponibilidade atual |
| `get_movie` | `movieId` | `{ movie: {...} }` |
| `get_seat_availability` | `sessionId` | Assentos disponíveis, reservados e ocupados; modo de reserva |
| `create_reservation` | `sessionId`, `seats` (lista de 1 a 24 assentos) | `{ reservation: {...} }` com ID, valor e `cancellationToken` |
| `cancel_reservation` | `reservationId`, `cancellationToken` | `{ reservation: {..., status: "cancelled"} }` |

Exemplo local: chame `create_reservation({ sessionId: "sessao-1", seats: ["B1", "B2"] })`.
A reserva custa R$ 64,00 fictícios. Guarde o `id` e o `cancellationToken` retornados para chamar `cancel_reservation`.
O token permite cancelar aquela reserva; seu valor não é gravado no arquivo, apenas seu hash.

As reservas locais são salvas em `.local/reservations.json` (ignorado pelo Git), separadas do catálogo. `CINEMA_RESERVATIONS_FILE` pode indicar outro caminho gravável. Reiniciar o servidor preserva as reservas. A gravação usa bloqueio entre processos e substituição atômica do arquivo, impedindo reservas concorrentes do mesmo assento. Não use esse arquivo em múltiplas máquinas. Um processo interrompido durante uma gravação pode deixar o diretório `.lock`; só remova esse bloqueio após confirmar que nenhum processo está gravando.

Cancelar novamente a mesma reserva é seguro. Assentos ocupados, inexistentes, repetidos ou já reservados são rejeitados; uma tentativa com conflito não reserva parte dos assentos. Erros dessas tools incluem `isError: true` e código estruturado como `SEAT_UNAVAILABLE`, `SESSION_NOT_FOUND` ou `RESERVATION_NOT_FOUND`.

Na Vercel (`VERCEL=1`), criar/cancelar retorna `STORAGE_NOT_CONFIGURED` sem gravar em arquivos temporários. A consulta de disponibilidade retorna o estado fictício do catálogo com `reservationMode: "disabled"`; localmente, retorna `local-json`. Esta é uma escolha da demonstração: sem banco externo, Redis ou novas credenciais. Datas passadas continuam aceitas para simulação. Não há pagamento nem expiração automática. A interface e as tools MCP usam as mesmas funções de reserva.

Para o Core Orchestrator, registre o manifesto e configure o cliente MCP Streamable HTTP com a URL pública terminada em `/api/mcp`. O protocolo trata inicialização e descoberta via `tools/list`; o teste de integração fornece um exemplo com o cliente oficial. A conexão com o Core real depende de sua URL e configuração e ainda não foi validada.

## Vercel

Importe o repositório na Vercel, selecione **Other** como framework e Node.js 24.x. Não há build da interface: ela está em `public/`. Deixe Build Command sem comando e configure Output Directory como `public`. `vercel.json` encaminha `/api/*` para a função TypeScript e inclui o JSON no pacote. O SDK MCP é a dependência de runtime; `tsx`, TypeScript e os tipos são ferramentas de desenvolvimento.

A publicação requer uma conta/projeto Vercel. Deploy do catálogo: https://cinemaduca.vercel.app. Atualizações na branch main podem gerar novo deploy automático. Depois do deploy, confira a página, `/api/manifest` e uma chamada MCP antes de cadastrar no Core.

## Verificação

`npm test` testa filtros, disponibilidade, respostas HTTP e um cliente MCP real: inicialização, descoberta, execução das seis ferramentas, cancelamento, disponibilidade, concorrência, persistência em JSON, erros de validação, comportamento de consulta na Vercel e rewrites. Os testes usam diretórios temporários e não alteram reservas da demonstração.
