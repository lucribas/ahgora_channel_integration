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


# Architecture:

![](doc/arch.png)


# Example of associaProjeto in Expert.rb:

~~~~
	# Metodo real usado - faca como o associaProjeto_exemplo e use a sua criatividade!
	def associaProjeto( _str_dia, _str_horas_trabalhadas)

		# # Edite o teu metodo aqui
		# puts "=================================================="
		# puts "Edite o arquivo Expert.rb no metodo associaProjeto"
		# puts "use o associaProjeto_exemplo como exemplo"
		# puts "crie a suas regras de associação de atividade!"
		# exit(-1)

		# daqui pra baixo segue o meu de exemplo

		result = []
		dia = valid_date( _str_dia )
		horas_saldo = parseTime(_str_horas_trabalhadas)
		prompt = TTY::Prompt.new

		@log.info "- Expert - dia: #{_str_dia} #{_str_horas_trabalhadas}"

		# ----------------------------------------
		# dependendo do dia quebra a Atividade
		# ----------------------------------------
		# Se for quarta-feira pergunta e associa o Lightning Talk de 15 minutos
		if horas_saldo > 5 and dia.wednesday? and prompt.yes?('Expert: Vc quer incluir o Lightning Talk de 15 minutos?') then
			opts = {}
			opts[:"Tipo"] = "AVULSO"
			opts[:"Cliente"] = "CERTI"
			opts[:"Natureza da operação"] = "13. Formação" # 13. Formação/Capacitação
			opts[:"Tipo de Atividade"] = "99601 " # 99601 – Lightning Talk
			opts[:"Data"] = _str_dia
			duracao = 0.25  # 15 minutos => 15/60=0.25
			opts[:"Duração"] = formatTime( duracao )
			opts[:"Comentarios"] = ""
			horas_saldo = horas_saldo - duracao
			result.push( opts )
		end

		# considera apenas os ultimos 15 dias e se o dia tem mais do que 5 horas
		if dia > ( Date.today - 15) and horas_saldo > 5 then
			# atribui o resto das horas para o projeto Y
			opts = {}
			opts[:"Tipo"] = "PROJETOS"
			opts[:"Projeto"] = "D15C0171.0"
			opts[:"Tipo de Atividade"] = "Nenhum"
			opts[:"Associar Atividade"] = "1.4.3.5.3"
			opts[:"Associar tarefa"] = "Nenhum"
			opts[:"Data"] = _str_dia
			duracao = horas_saldo
			opts[:"Duração"] = formatTime( duracao )
			opts[:"Comentarios"] = ""
			horas_saldo = horas_saldo - duracao
			result.push( opts )
		else
			@log.info "Expert: ignorou o dia: #{_str_dia} #{_str_horas_trabalhadas}"
		end
		if result.size > 0 then
			@log.info "Expert: atribuiu as seguintes atividades para o dia: #{_str_dia} #{_str_horas_trabalhadas}"
			result.each { |o| @log.info "\t\t" + o.inspect }
			@log.info "-------------------------------------------------------------------------------------------------"
		end
		return result
	end
  
~~~~

# Example:

![](demo.gif)


# Author:
Luciano da Silva Ribas

# Contributors:
your name here :)

Enjoy!
