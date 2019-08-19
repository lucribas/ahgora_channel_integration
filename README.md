# ahgora_channel_integration
Integration of Ahgora and Channel systems

# Objetivo:
Preenche de forma automatica o channel com base no Ahgora.
Mantém o Channel sincronizado.

# Como funciona:
O script usa a biblioteca Selenium para controlar uma instancia do browser que abre o Ahgora e o Channel. O script navega pelas paginas da mesma forma que o usuário normal e obtem um relatório do ponto do ultimo mês do Ahgora e do Channel. Ele então faz a comparação e mostra os novos apontamentos a serem inseridos no Channel para fazer o sincronismo.

O projeto, tarefa, etc deve é atribuido pelo Script. Quem for usá-lo deve portanto modificar o script para o seu projeto default ou estabelecer regras ou divisões para quebrar o dia em sub tarefas caso necessario.


# Requisitos:
- Ruby
- Chrome browser


# Todo/Bugs/Sugestões:
- Consultar https://github.com/lucribas/ahgora_channel_integration


# Example:

![](demo.gif)


Enjoy!
