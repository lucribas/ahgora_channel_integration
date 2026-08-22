#!/usr/bin/env bash

# Copie para config.sh, preencha os valores e execute: source config.sh
export AHGORA_LOGIN_URL='https://www.ahgora.com.br/externo/index/ID_DA_EMPRESA'
export AHGORA_BATIDAS_URL='https://www.ahgora.com.br/externo/batidas'
export AHGORA_MIRROR_URL='https://app.ahgora.com.br/externo/mirror'
export AHGORA_MATRICULA='SUA_MATRICULA'
# Correcoes manuais opcionais: data=hora,hora,...; separar varias datas com ';'
# export AHGORA_PUNCH_OVERRIDES='04/08/2026=08:05,09:19,09:23,12:08,13:20,17:54'

export CHANNEL_LOGIN_URL='https://channel.example.com/channel/login.do'
export CHANNEL_EXTRATO_URL='https://channel.example.com/channel/apontamento.do?action=listarDatas&retorno=painel'
export CHANNEL_USERNAME='SEU_USUARIO'

# Regra padrao usada pelo Expert para novos apontamentos do Ahgora.
export CHANNEL_DEFAULT_PROJECT='CODIGO_DO_PROJETO'
export CHANNEL_DEFAULT_ACTIVITY='CODIGO_DA_ATIVIDADE'
export CHANNEL_DEFAULT_ACTIVITY_TYPE='Nenhum'
export CHANNEL_DEFAULT_TASK='Nenhum'

# Omitir normalmente: webdrivers detecta e baixa o driver compativel.
# export CHROME_BINARY='/caminho/para/google-chrome'
# export CHROMEDRIVER_PATH='/caminho/para/chromedriver'

# Senhas sao opcionais aqui; se omitidas, o programa solicita sem eco no terminal.
# export AHGORA_PASSWORD='...'
# export CHANNEL_PASSWORD='...'
