import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { EMPRESA, SUPORTE_EMAIL, APP_NOME } from '../config';

/**
 * Termos de Uso e Política de Privacidade.
 * As duas lojas EXIGEM uma URL pública de política de privacidade:
 *   https://SEU-DOMINIO/privacidade
 * Revise os textos com seu advogado antes de publicar. Os trechos entre [ ] são para você preencher.
 */
const ATUALIZADO = '17 de novembro de 2026';

const H = ({ children }) => <h2 className="font-bold text-base mt-5 mb-1">{children}</h2>;
const P = ({ children }) => <p className="text-sm text-stone-700 leading-relaxed mb-2">{children}</p>;
const L = ({ children }) => <li className="text-sm text-stone-700 leading-relaxed ml-4 list-disc mb-1">{children}</li>;

function Privacidade() {
  return (
    <>
      <h1 className="font-bold text-xl">Política de Privacidade</h1>
      <p className="text-xs text-stone-500 mt-1">Atualizada em {ATUALIZADO}</p>

      <P>Esta política explica quais dados o {APP_NOME} coleta, por que coleta e o que você pode fazer a respeito. O responsável pelo tratamento dos dados é <b>{EMPRESA}</b> ([CNPJ/endereço]), que você pode contatar em <a className="underline" href={`mailto:${SUPORTE_EMAIL}`}>{SUPORTE_EMAIL}</a>.</P>

      <H>1. Dados que coletamos</H>
      <ul>
        <L><b>Conta:</b> nome, e-mail e/ou telefone e senha (guardada de forma criptografada pelo nosso provedor de autenticação).</L>
        <L><b>Perfil:</b> foto, se você enviar, e suas preferências de aviso (pães, salgados, doces).</L>
        <L><b>Uso do app:</b> panificadoras que você segue, curtidas, comentários, notas e pedidos feitos pelo cardápio.</L>
        <L><b>Delivery:</b> endereço de entrega, telefone, forma de pagamento e os itens do pedido. Ficam visíveis só para você e para a panificadora que recebeu o pedido.</L>
        <L><b>Localização aproximada:</b> somente quando você toca em “usar minha localização”, para ordenar as panificadoras por distância. Não guardamos histórico de localização do cliente.</L>
        <L><b>Notificações:</b> um identificador do aparelho (token de push), para enviar o aviso de fornada.</L>
        <L><b>Dados técnicos:</b> registros de acesso e erros, usados para segurança e para corrigir falhas.</L>
      </ul>

      <H>2. Para que usamos</H>
      <ul>
        <L>Criar e manter sua conta e mostrar o conteúdo das panificadoras que você segue.</L>
        <L>Enviar avisos de fornada e de pedidos (você pode desligar a qualquer momento).</L>
        <L>Processar os pedidos feitos pelo cardápio digital e pelo delivery e entregá-los ao estabelecimento, que usa seu endereço e telefone para fazer a entrega e falar com você sobre o pedido.</L>
        <L>Prevenir fraude e abuso, e cumprir obrigações legais.</L>
      </ul>
      <P>Base legal (LGPD, art. 7º): execução do contrato (uso do app), consentimento (localização e notificações) e legítimo interesse (segurança e melhoria do serviço).</P>

      <H>3. Com quem compartilhamos</H>
      <P>Com a panificadora quando você faz um pedido ou comenta nela, e com prestadores que operam a infraestrutura: Supabase (banco de dados, autenticação e arquivos), Apple e Google (entrega das notificações e distribuição do app) e o serviço de hospedagem do site. Não vendemos seus dados nem fazemos publicidade com eles.</P>

      <H>4. Por quanto tempo guardamos</H>
      <P>Enquanto sua conta existir. Se você excluir a conta no app, apagamos seu perfil, suas curtidas, comentários, notas e quem você segue em até 30 dias, mantendo apenas o que a lei exige (por exemplo, registros fiscais de pedidos, quando houver).</P>

      <H>5. Seus direitos</H>
      <P>Você pode acessar, corrigir, levar embora ou apagar seus dados, retirar o consentimento e pedir informações sobre o tratamento. No app: <b>Ajustes → Excluir conta</b>. Por e-mail: <a className="underline" href={`mailto:${SUPORTE_EMAIL}`}>{SUPORTE_EMAIL}</a>, respondido em até 15 dias.</P>

      <H>6. Segurança</H>
      <P>Os dados trafegam criptografados (HTTPS) e o acesso ao banco é restrito por políticas por usuário (RLS). Nenhum sistema é infalível: se acontecer um incidente relevante, avisaremos você e a ANPD conforme a lei.</P>

      <H>7. Crianças</H>
      <P>O {APP_NOME} não é destinado a menores de 13 anos. Se identificarmos uma conta nessa faixa, ela será removida.</P>

      <H>8. Mudanças</H>
      <P>Se mudarmos esta política, avisaremos no app antes de a mudança valer.</P>
    </>
  );
}

function Termos() {
  return (
    <>
      <h1 className="font-bold text-xl">Termos de Uso</h1>
      <p className="text-xs text-stone-500 mt-1">Atualizados em {ATUALIZADO}</p>

      <P>Ao usar o {APP_NOME}, você concorda com estes termos. Se não concordar, não use o app.</P>

      <H>1. O que o app é</H>
      <P>O {APP_NOME} conecta clientes a panificadoras: avisa quando sai fornada, mostra o cardápio e permite enviar pedidos ao estabelecimento. Quem produz, vende e entrega os produtos é a panificadora — o {APP_NOME} é o canal. Preços, disponibilidade, qualidade e atendimento são responsabilidade dela.</P>

      <H>2. Sua conta</H>
      <ul>
        <L>Você precisa ter 13 anos ou mais e fornecer dados verdadeiros.</L>
        <L>A senha é sua responsabilidade. Avise-nos se suspeitar de uso indevido.</L>
        <L>Uma conta de panificadora só pode ser criada por quem representa o estabelecimento.</L>
      </ul>

      <H>3. Conteúdo publicado por você</H>
      <P>Fotos, legendas, comentários e notas são seus; você nos dá permissão para exibi-los no app. É proibido publicar conteúdo ilegal, ofensivo, discriminatório, enganoso, de terceiros sem autorização, spam ou conteúdo adulto. Você pode denunciar qualquer publicação pelo menu “⋯” e bloquear uma panificadora quando quiser.</P>
      <P>Podemos remover conteúdo e suspender contas que descumpram estas regras, com aviso quando possível.</P>

      <H>4. Pedidos pelo cardápio e delivery</H>
      <P>O pedido enviado pelo app é um pedido feito diretamente à panificadora — para consumo no local (mesa) ou para entrega (delivery). No delivery, a taxa de entrega, o pedido mínimo e o tempo estimado são definidos pela panificadora e mostrados antes de você confirmar. O pagamento é feito na entrega (Pix, dinheiro ou cartão), direto à panificadora. Em itens vendidos por peso, o valor é uma estimativa: o peso na balança pode variar um pouco e a panificadora pode ajustar o total, avisando você. Você pode cancelar enquanto o pedido estiver como “recebido”; depois disso, fale com a panificadora. Cancelamentos e trocas seguem o atendimento dela e o Código de Defesa do Consumidor.</P>

      <H>5. Planos das panificadoras</H>
      <P>Panificadoras podem contratar planos mensais de recursos. Valores, prazos e condições de cancelamento são informados no momento da contratação. Quando a cobrança ocorrer por meio das lojas de aplicativos, valem também as regras da Apple e do Google.</P>

      <H>6. Uso indevido</H>
      <P>É proibido tentar invadir, sobrecarregar, extrair dados em massa ou usar o {APP_NOME} para fins ilegais.</P>

      <H>7. Limites</H>
      <P>O app é oferecido “como está”. Não garantimos funcionamento sem interrupções nem que o aviso de fornada chegará sempre (a entrega depende da Apple, do Google e da sua operadora). Nossa responsabilidade se limita ao previsto na legislação aplicável.</P>

      <H>8. Encerramento</H>
      <P>Você pode excluir sua conta a qualquer momento em Ajustes. Podemos encerrar contas que violem estes termos.</P>

      <H>9. Lei e foro</H>
      <P>Aplica-se a lei brasileira, no foro do domicílio do consumidor.</P>

      <H>10. Contato</H>
      <P><a className="underline" href={`mailto:${SUPORTE_EMAIL}`}>{SUPORTE_EMAIL}</a></P>
    </>
  );
}

export default function Legal() {
  const { pathname } = useLocation();
  const priv = pathname.includes('privacidade');
  return (
    <div className="min-h-screen bg-stone-100 flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen">
        <header className="sticky top-0 bg-white border-b border-stone-200 px-3 py-2 flex items-center gap-2" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
          <Link to="/" aria-label="Voltar" className="p-1"><ChevronLeft size={22} /></Link>
          <span className="font-bold text-sm">{priv ? 'Privacidade' : 'Termos de Uso'}</span>
        </header>
        <div className="px-5 py-5 pb-16">
          {priv ? <Privacidade /> : <Termos />}
          <p className="text-xs text-stone-400 mt-8">
            {priv ? <Link to="/termos" className="underline">Ver Termos de Uso</Link> : <Link to="/privacidade" className="underline">Ver Política de Privacidade</Link>}
          </p>
        </div>
      </div>
    </div>
  );
}
