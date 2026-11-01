// Guia da Mesa — modelo pronto "Primeiros passos no Foundry" (o narrador ajusta à vontade)
import { newTour, newStep } from "./store.js";
import { presetTarget } from "./targets.js";

const S = (title, text, preset, extra = {}) =>
  newStep({ title, text, target: preset ? presetTarget(preset) : { type: "none" }, ...extra });

export function starterTour() {
  return newTour({
    name: "Primeiros passos no Foundry",
    description: "Um passeio rápido pelas partes da tela que você vai usar em toda sessão.",
    icon: "fa-solid fa-dice-d20",
    autoStart: true,
    steps: [
      S("Bem-vindo à mesa!",
        "<p>Este é o <b>Foundry</b>, a mesa virtual onde vamos jogar.</p><p>Em poucos passos você vai saber onde fica cada coisa. Use <b>Próximo</b> ou as setas do teclado. Pode refazer este tutorial quando quiser no botão <i class=\"fa-solid fa-circle-question\"></i> <b>Ajuda</b>.</p>",
        null, { effects: { dim: true, ring: false, arrow: false } }),
      S("O mapa",
        "<p>O meio da tela é o <b>mapa</b>. Seu personagem aparece nele como uma ficha redonda ou quadrada (o <i>token</i>).</p><ul><li><b>Arrastar</b> o token: move o personagem</li><li><b>Botão direito + arrastar</b>: anda pelo mapa</li><li><b>Rodinha do mouse</b>: zoom</li></ul>",
        null, { effects: { dim: false, ring: false, arrow: false } }),
      S("A barra lateral",
        "<p>Do lado direito fica a <b>barra lateral</b>. É nela que estão o chat, os personagens, o diário e as configurações. Cada ícone no topo abre uma aba diferente.</p>",
        "sidebar", { position: "left" }),
      S("O chat",
        "<p>Este ícone abre o <b>chat</b>. Clique nele agora para continuar.</p>",
        "tab-chat", { advance: "click" }),
      S("Onde aparecem as rolagens",
        "<p>Mensagens e <b>resultados dos dados</b> aparecem aqui. Passe o mouse em uma rolagem para ver os detalhes.</p>",
        "chat-log", { position: "left" }),
      S("Escrevendo e rolando dados",
        "<p>Digite aqui para falar com a mesa. Para rolar dados, escreva por exemplo:</p><p><code>/r 1d20</code> &nbsp;ou&nbsp; <code>/r 2d6+3</code></p><p>e aperte <b>Enter</b>.</p>",
        "chat-input", { position: "left" }),
      S("Quem vê a sua rolagem",
        "<p>Aqui você escolhe <b>quem pode ver</b> o resultado: todos, só o narrador ou só você. Na dúvida, deixe em <b>Pública</b>.</p>",
        "roll-mode", { position: "left" }),
      S("Sua ficha de personagem",
        "<p>Esta é a <b>sua ficha</b>. Aqui ficam atributos, perícias, equipamentos e anotações. Na maioria dos sistemas, clicar no nome de uma perícia ou atributo já <b>rola o dado</b>.</p><p>Para abrir a ficha de novo depois: aba <b>Atores</b> → clique duas vezes no seu personagem, ou clique duas vezes no seu token no mapa.</p>",
        "my-sheet", { before: { action: "openMySheet", value: "" }, position: "auto" }),
      S("Atores",
        "<p>Na aba <b>Atores</b> ficam os personagens. O seu sempre estará aqui.</p>",
        "tab-actors", { before: { action: "closeWindows", value: "" } }),
      S("O diário",
        "<p>O <b>Diário</b> guarda textos da campanha: anotações, mapas, cartas e pistas que o narrador compartilhar com vocês.</p>",
        "tab-journal"),
      S("Ferramentas do mapa",
        "<p>Estes botões mudam o que o mouse faz no mapa: selecionar tokens, <b>medir distâncias</b> (régua), fazer anotações e mais. Passe o mouse sobre cada um para ver o nome.</p>",
        "scene-controls", { position: "right" }),
      S("Barra de atalhos",
        "<p>Aqui embaixo fica a <b>barra de atalhos</b>. Você pode arrastar coisas da ficha (armas, magias) para cá e usá-las com um clique.</p>",
        "hotbar", { position: "top" }),
      S("Jogadores conectados",
        "<p>Aqui você vê <b>quem está online</b> na mesa e a cor de cada jogador.</p>",
        "players", { position: "top" }),
      S("Tudo pronto!",
        "<p>É isso! Se ficar perdido durante o jogo, o narrador pode <b>apontar direto na sua tela</b> onde clicar. E você pode chamar o narrador pelo botão <i class=\"fa-solid fa-hand\"></i>.</p><p><b>Boa sessão!</b></p>",
        null, { effects: { dim: true, ring: false, arrow: false } })
    ]
  });
}
