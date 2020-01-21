
require 'tty-prompt'
require_relative './vars'
require 'date'
require 'pry'


class Nolog
	def initialize( debug = false ) @debug = debug end
	def info(str) puts str end
	def debug(str) puts str if @debug end
end

class Expert

	def initialize( debug = false)
		@debug = debug
		@log = Nolog.new(debug)
	end

	def set_log( log = nil )
		@log = log
	end

	def set_timestap( tms = nil )
		@timestamp = tms
	end

	# Exemplo de uso - este metodo é chamado para cada novo apontamento
	# ele deve retornar uma ou mais tarefas para serem criadas
	def associaProjeto_exemplo( _str_dia, _str_horas_trabalhadas)
		result = []
		dia = valid_date( _str_dia )
		horas_saldo = parseTime(_str_horas_trabalhadas)
		prompt = TTY::Prompt.new

		@log.info "- Expert - dia: #{_str_dia} #{_str_horas_trabalhadas}"

		if false then
			# Exemplos de Formatos suportados
			# por PROJETOS
			opts = {}
			opts[:"Tipo"] = "PROJETOS"
			opts[:"Projeto"] = "D15C0171.0"
			opts[:"Tipo de Atividade"] = "Nenhum"
			opts[:"Associar Atividade"] = "2.4.5.6"
			opts[:"Associar tarefa"] = "Nenhum"
			opts[:"Data"] = _str_dia
			duracao = horas_saldo
			opts[:"Duração"] = formatTime( duracao )
			opts[:"Comentarios"] = ""
			horas_saldo = horas_saldo - duracao
			result.push( opts )

			# por OPERACOES
			opts = {}
			opts[:"Tipo"] = "OPERACOES"
			opts[:"Operação"] = "Nenhum"
			opts[:"Tipo de Atividade"] = "Nenhum"
			opts[:"Rubrica"] = "Nenhum"
			opts[:"Passo do workflow"] = "Nenhum"
			opts[:"Solicitação"] = "Nenhum"
			opts[:"Tarefa de Solicitação"] = "Nenhum"
			opts[:"Cliente"] = "Nenhum"
			opts[:"Comentarios"] = ""

			# por AVULSO
			opts = {}
			opts[:"Tipo"] = "AVULSO"
			opts[:"Cliente"] = "X"
			opts[:"Natureza da operação"] = "13. Formação" # 13. Formação/Capacitação
			opts[:"Tipo de Atividade"] = "99601 " # 99601 – Lightning Talk
			opts[:"Data"] = _str_dia
			duracao = 0.25  # 15 minutos => 15/60=0.25
			opts[:"Duração"] = formatTime( duracao )
			opts[:"Comentarios"] = ""
			result.push( opts )
		end

		# ----------------------------------------
		# Segue um exemplo que dependendo do dia quebra a Atividade
		# ----------------------------------------

		# exemplo de apontar dentro de um periodo de dias para um unico projeto
		if dia >  valid_date( "01/06/2019" ) and
		   dia <  valid_date( "21/06/2019" ) then

		   	opts = {}
			opts[:"Tipo"] = "PROJETOS"
			opts[:"Projeto"] = "D15C0171.0"
			opts[:"Tipo de Atividade"] = "Nenhum"
			opts[:"Associar Atividade"] = "2.4.5.6"
			opts[:"Associar tarefa"] = "Nenhum"
			opts[:"Data"] = _str_dia
			duracao = horas_saldo
			opts[:"Duração"] = formatTime( duracao )
			horas_saldo = horas_saldo - duracao
			result.push( opts )

		# exemplo considera apenas os ultimos 7 dias
		elsif dia > ( Date.today - 7) then

			# pergunta se quer adicionar o projeto X
			if prompt.yes?('Expert: Vc quer incluir o projeto X?') then
				opts = {}
				opts[:"Tipo"] = "PROJETOS"
				opts[:"Projeto"] = "X"
				opts[:"Tipo de Atividade"] = "Nenhum"
				opts[:"Associar Atividade"] = "1.4.3.5.3"
				opts[:"Associar tarefa"] = "Nenhum"
				opts[:"Data"] = _str_dia
				duracao = prompt.ask("Quantas horas (zero a #{horas_saldo}) voce quer apontar?").to_f
				opts[:"Duração"] = formatTime( duracao )
				opts[:"Comentarios"] = ""
				horas_saldo = horas_saldo - duracao
				result.push( opts )
			end

			# Se for quarta-feira pergunta e associa o Lightning Talk de 15 minutos
			if dia.wednesday? and prompt.yes?('Expert: Vc quer incluir o Lightning Talk de 15 minutos?') then
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

			# atribui o resto das horas para o projeto Y
			opts = {}
			opts[:"Tipo"] = "PROJETOS"
			opts[:"Projeto"] = "Y"
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



	# Metodo real usado - faca como o associaProjeto_exemplo e use a sua criatividade!
	def associaProjeto( _str_dia, _str_horas_trabalhadas)

		# Edite o teu metodo aqui
		puts "=================================================="
		puts "Edite o arquivo Expert.rb no metodo associaProjeto"
		puts "use o associaProjeto_exemplo como exemplo"
		puts "crie a suas regras de associação de atividade!"
		exit(-1)

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
			opts[:"Natureza da operação"] = "13.Form" # 13. Formação/Capacitação
			opts[:"Tipo de Atividade"] = "99601" # 99601 – Lightning Talk
			opts[:"Data"] = _str_dia
			duracao = 0.25  # 15 minutos => 15/60=0.25
			opts[:"Duração"] = formatTime( duracao )
			opts[:"Comentarios"] = ""
			horas_saldo = horas_saldo - duracao
			result.push( opts )
		end

		# considera apenas os ultimos 15 dias e se o dia tem mais do que 5 horas
		#if dia > ( Date.today - 15) and horas_saldo > 5 then

		#------------------------------------------------------------------
		# PROJETOS

		#1. considera um projeto que comecou em 08/01/2020 com diferentes cargas horarias
		if dia > valid_date("08/01/2020") and dia < Date.today then
			# atribui o resto das horas para o projeto Y
			opts = {}
			opts[:"Tipo"] = "PROJETOS"
			opts[:"Projeto"] = "T15C0135.0"
			opts[:"Tipo de Atividade"] = "Nenhum"
			opts[:"Associar Atividade"] = "1.2.3.3"
			opts[:"Associar tarefa"] = "Nenhum"
			opts[:"Data"] = _str_dia

			duracao = 0
			duracao = 2 if dia >= valid_date("08/01/2020") && dia <= valid_date("10/01/2020")
			duracao = 3 if dia >= valid_date("11/01/2020") && dia <= valid_date("17/01/2020")
			duracao = 4 if dia >= valid_date("18/01/2020")

			opts[:"Duração"] = formatTime( duracao )
			opts[:"Comentarios"] = ""
			horas_saldo = horas_saldo - duracao
			result.push( opts )
		else
			@log.info "Expert: ignorou o dia: #{_str_dia} #{_str_horas_trabalhadas}"
		end

		#2. considera apenas os ultimos 15 dias antes de hoje
		if dia > ( Date.today - 15) and dia < Date.today then
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


		#------------------------------------------------------------------
		if result.size > 0 then
			@log.info "Expert: atribuiu as seguintes atividades para o dia: #{_str_dia} #{_str_horas_trabalhadas}"
			result.each { |o| @log.info "\t\t" + o.inspect }
			@log.info "-------------------------------------------------------------------------------------------------"
		end
		return result
	end


	# returns a HH:mm string for a decimal number that represents hours
	def formatTime( _int_horas )
		value = (_int_horas*60).divmod(60).map{ |a| "%02d"%[a.floor] }.join(":")
		@log.debug "formatTime ==>#{_int_horas} : #{value}<==="
		return value
	end

	# returns a Date type for a string that represents a date
	def valid_date( str, format="%d/%m/%Y" )
		begin
	  		result = Date.strptime(str,format)
		rescue StandardError => e
			puts "--> Error \"#{e.message}\"."
			@log.info "#{e.backtrace}"
			exit(-1)
		end
		return result
	end

	# returns decimal hours from a string HH:MM
	def parseTime( str )
		sign = str.start_with?("-") ? -1 : 1
		sp = str.split(":")
		if sp.length!=2 then
			@log.info "ERROR during parseTime of #{str}"
			exit(-1)
		end
		value = sign*(sign*sp[0].to_i*60+sp[1].to_i)/60.0
		@log.debug "parseTime ==>#{str} : %.2f<===" % value
		return value
	end
end
