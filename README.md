# ahgora_channel_integration
Integration of Ahgora and Channel systems

# Objetivo:
Preenche de forma automatica o channel com base no Ahgora.
Mantém o Channel sincronizado.

# Como funciona:
O script em Ruby controla uma instancia do browser e abre o Ahgora e o Channel. O script então navega pelas paginas da mesma forma que o usuário normal e obtem um relatório do ultimo mês do Ahgora e do Channel. Ele então faz a comparação entre o ponto eletronico e os apontamentos de projetos. A seguir ele mostra os novos apontamentos e pede a confirmação para inseri-los no Channel.

O projeto, tarefa, etc é atribuido pelo Script de forma automática. Quem for usá-lo deve portanto modificar o script para o seu projeto default ou estabelecer regras ou divisões para quebrar as batidas do ponto em quantos apontamentos forem necessários.


# Requisitos:
- Ruby
- Chrome browser


# Todo/Bugs/Sugestões:
- Consultar https://github.com/lucribas/ahgora_channel_integration


# Example:

![](demo.gif)


Enjoy!
