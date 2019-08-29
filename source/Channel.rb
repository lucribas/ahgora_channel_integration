require "selenium-webdriver"
require "tty-prompt"
require 'date'
require_relative './vars'
require 'pry'


class Nolog
	def initialize( debug = false ) @debug = debug end
	def info(str) puts str end
	def debug(str) puts str if @debug end
end

class Channel

	def initialize( debug = false, show_browser = false )
		@debug = debug
		@log = Nolog.new(debug)
		@show_browser = show_browser
	end

	def set_log( log = nil )
		@log = log
	end

	def set_timestap( tms = nil )
		@timestamp = tms
	end

	def open_web_session()

		#sheet cheat https://gist.github.com/kenrett/7553278
		#@driver = Selenium::WebDriver.for :chrome
		options = Selenium::WebDriver::Chrome::Options.new

		options.add_argument('--ignore-certificate-errors')
		options.add_argument('--disable-popup-blocking')
		options.add_argument('--disable-translate')
		options.add_argument('--disable-web-security');
		options.add_argument('--allow-running-insecure-content')
		options.add_argument('--unsafely-treat-insecure-origin-as-secure=http://fonts.googleapis.com')
		options.add_argument('--allow-insecure-localhost');
		options.add_argument('--reduce-security-for-testing');
		# configure the @driver to run in headless mode
		options.add_argument('--headless') if !@show_browser

		@driver = Selenium::WebDriver.for :chrome, options: options

		# resize the window
		@driver.manage.window.resize_to(1400, 2300)

	end

	def web_login(channel_password)

		@wait = Selenium::WebDriver::Wait.new(:timeout => 30)

		#----- LOGIN -----
		@log.info "navigate to #{CHANNEL_LOGIN_URL}"
		@driver.navigate.to CHANNEL_LOGIN_URL
		@wait.until { @driver.title.downcase.start_with? "channel" }

		# Enters with Login da Empresa and SUBMIT
		#@log.debug  @driver.title
		#element = @driver.find_element(name: 'empresa')
		#element.send_keys CHANNEL_EMPRESA
		#element.submit

		# Enters with Login do Usuario and SUBMIT
		@log.debug  @driver.title
		#@driver.execute_script("\$(\'button[type=submit]\').text(\'Entrar\');")
		#@driver.execute_script("\$(\'#login #matricula\').removeClass(\'hide\');")
		#@driver.execute_script("\$(\'#login #senha\').removeClass(\'hide\');")
		@wait.until { @driver.find_element(name: 'password').displayed? }
		element = @driver.find_element(id: 'loginForm').find_element(name: 'username')
		element.send_keys CHANNEL_USERNAME
		element = @driver.find_element(id: 'loginForm').find_element(name: 'password')
		element.send_keys channel_password
		element.submit
		#binding.pry

		#tbd testar se sucesso..

		#-- MENU
		@log.debug  @driver.title
		@wait = Selenium::WebDriver::Wait.new(:timeout => 30)
		@wait.until { @driver.title.downcase.start_with? "channel" }

	end


	def get_batidas()

		batidas = []
		@wait = Selenium::WebDriver::Wait.new(:timeout => 30)

		#----- Acessar Extrato entre 01/01/2019 e dia de hoje -----
		@log.info "navigate to #{CHANNEL_EXTRATO_URL}"
		@driver.navigate.to CHANNEL_EXTRATO_URL
		@wait.until { @driver.find_element(id: "totalItensPagina").displayed? }

		element = @driver.find_element(id: "totalItensPagina")
		options = element.find_elements(tag_name: "option")
		options.each { |option| option.click if option.text == "Não paginar" }

		@wait.until { @driver.find_element(name: 'dataInicial').displayed? }
		element = @driver.find_element(id: 'conteudo').find_element(name: 'dataInicial')
		element.clear
		element.send_keys "01/01/2019"
		element = @driver.find_element(id: 'conteudo').find_element(name: 'dataFinal')
		element.clear
		element.send_keys Time.new.strftime("%d/%m/%Y")
		#element.find_elements(value: "Filtrar").click
		@driver.find_element(:xpath, '//*[contains(@value, "Filtrar")]').click
		@wait = Selenium::WebDriver::Wait.new(:timeout => 30)

		# Aguarda relatorio
		@wait.until { @driver.title.downcase.start_with? "channel" }
		#@wait.until { @driver.find_element(name: 'dataInicial').displayed? }
		#@wait.until {  !@driver.find_element(:xpath => "//*[@id='filho_07_01_2019_0']").nil? }
		sleep 4

		# @wait.until {
		# 	a = 0
		# 	ok = false
		# 	begin
		# 	@driver.find_elements(:xpath => "//tbody[@id='tblListagem']").each do |r|
		# 		a = a + 1
		# 		ok = (a > 100)
		# 	end
		# 	rescue e
		# 	end
		# 	return ok
		# }

		@log.debug  @driver.title
		@log.debug  "-----------------------------------------------------"
		@log.debug  "Processa relatorio de apontamentos"
		#@driver.find_elements(:xpath => "//div[@id='conteudo']").each do |r|
		@driver.find_elements(:xpath => "//tbody[@id='tblListagem']").each do |r|
			@log.debug  "Cell Value: " + r.text
			batidas.push(r.text)
		end

		batidas = batidas[0].split("\n")
		bats = []
		batidas.each do |r|
			n = r.gsub("  ", " ").split(" ")
			dia = valid_date?( "#{n[0].strip}", "%d/%m/%Y" )
			hr = parseTime( n[1] )
			bats.push( [dia, hr, n[1]] )
		end
		batidas = bats

		#binding.pry
		@log.debug  "-----------------------------------------------------"

		# resize the window and take a screenshot
		@driver.manage.window.resize_to(1200, 300+batidas.size*32)
		@driver.save_screenshot "log/Channel_screenshot_#{@timestamp}.png"

		#@driver.find_element(id: 'login').submit
		return batidas
	end


	def selectOption( _id, _opt_to_select)
		found_ok = false
		tries_cnt = 10
		while (tries_cnt>0 and !found_ok)
			begin
				tries_cnt = tries_cnt - 1
				element = @driver.find_element(id: _id)
				options = element.find_elements(tag_name: "option")
				options.each { |option| begin option.click; found_ok=true; break option; end if option.text.start_with?(_opt_to_select) }
			rescue
				@log.info "ERROR selecting option #{_opt_to_select} in #{_id}" if !found_ok
			end
		end
		@log.info "ERROR selecting option #{_opt_to_select} in #{_id}" if !found_ok
		return found_ok
	end

	def enterText( _id, _txt_to_enter)
		found_ok = false
		tries_cnt = 10
		while (tries_cnt>0 and !found_ok)
			begin
				tries_cnt = tries_cnt - 1
				element = @driver.find_element(id: _id)
				element.clear
				element.send_keys _txt_to_enter
				found_ok = true
			rescue StandardError => e
				@log.info "ERROR entering text #{_txt_to_enter} in #{_id}" if !found_ok
				@log.info "--> Error \"#{e.message}\"."
				@log.info "#{e.backtrace}"
#				binding.pry if tries_cnt < 2
				sleep(0.3)
			end
		end
		@log.info "ERROR entering text #{_txt_to_enter} in #{_id}" if !found_ok
		return found_ok
	end

	def enterText2( _id1, _id2, _txt_to_enter)
		found_ok = false
		tries_cnt = 10
		while (tries_cnt>0 and !found_ok)
			begin
				tries_cnt = tries_cnt - 1
				element = @driver.find_element(id: _id1)
				element = element.find_element(id: _id2)
				element.clear
				element.send_keys _txt_to_enter
				found_ok = true
			rescue StandardError => e
				@log.info "ERROR entering with text #{_txt_to_enter} in #{_id1} -> #{_id2}" if !found_ok
				@log.info "--> Error \"#{e.message}\"."
				@log.info "#{e.backtrace}"
#				binding.pry if tries_cnt < 2
				sleep(0.3)
			end
		end
		@log.info "ERROR entering text #{_txt_to_enter} in #{_id}" if !found_ok
		return found_ok
	end

	def push_batida( opts )

		@log.info ("push_batida: " + opts.inspect)
		# # Exemplos de Formatos suportados
		# # por PROJETOS
		# opts[:"Tipo"] = "PROJETOS"
		# opts[:"Projeto"] = "D15C0171.0"
		# opts[:"Tipo de Atividade"] = "Nenhum"
		# opts[:"Associar Atividade"] = "2.4.5.6"
		# opts[:"Associar tarefa"] = "Nenhum"
		# opts[:"Data"] = _str_dia
		# opts[:"Duração"] = formatTime( duracao )
		# opts[:"Comentarios"] = ""
		#
		# # por OPERACOES
		# opts[:"Tipo"] = "OPERACOES"
		# opts[:"Operação"] = "Nenhum"
		# opts[:"Tipo de Atividade"] = "Nenhum"
		# opts[:"Rubrica"] = "Nenhum"
		# opts[:"Passo do workflow"] = "Nenhum"
		# opts[:"Solicitação"] = "Nenhum"
		# opts[:"Tarefa de Solicitação"] = "Nenhum"
		# opts[:"Cliente"] = "Nenhum"
		# opts[:"Comentarios"] = ""
		#
		# # por AVULSO
		# opts[:"Tipo"] = "AVULSO"
		# opts[:"Cliente"] = "X"
		# opts[:"Natureza da operação"] = "13. Formação" # 13. Formação/Capacitação
		# opts[:"Tipo de Atividade"] = "99601 " # 99601 – Lightning Talk
		# opts[:"Data"] = _str_dia
		# opts[:"Duração"] = formatTime( duracao )
		# opts[:"Comentarios"] = ""

		#----- nao tem como acessar direto :( -----
		#@driver.navigate.to "https://channel.certi.org.br/channel/apontamento.do?action=novo"

		#----- Acessar Extrato se nao estiver aberto -----
		found = false
		begin
			found = ! @driver.find_element(id: "incluirNovoApontamento").nil?
		rescue
			sleep(0.1)
		end

		if !found then
			@log.info "navigate to #{CHANNEL_EXTRATO_URL}"
			@driver.navigate.to CHANNEL_EXTRATO_URL
			@wait.until { @driver.find_element(id: "incluirNovoApontamento").displayed? }
		end

		#-- Click on Link "Incluir Novo Apontamento"
		@driver.find_element(id: "incluirNovoApontamento").click
		@wait.until { @driver.find_element(id: "apontamento_diario").displayed? }

		if opts[:"Tipo"] == "PROJETOS" then
			@driver.find_element(id: "tpApontamentoProjeto").click
			selectOption( "apontamento.projetosSelecionado",		opts[:"Projeto"] )
			selectOption( "apontamento.idTipoAtividadeProjeto",		opts[:"Tipo de Atividade"] )
			selectOption( "apontamento.notificacaoSelecionada",		opts[:"Associar Atividade"] )
			selectOption( "apontamento.idTarefa",					opts[:"Associar tarefa"] )

		elsif opts[:"Tipo"] == "OPERACOES" then
			@driver.find_element(id: "tpApontamentoOperacao").click
			selectOption( "apontamento.idOperacao",					opts[:"Operação"] )
			selectOption( "apontamento.idTipoAtividadeOperacao",	opts[:"Tipo de Atividade"] )
			selectOption( "apontamento.idRubrica",					opts[:"Rubrica"] )
			selectOption( "apontamento.idPassoWorkflow",			opts[:"Passo do workflow"] )
			selectOption( "apontamento.idTicket",					opts[:"Solicitação"] )
			selectOption( "apontamento.idTarefaTicket",				opts[:"Tarefa de Solicitação"] )
			selectOption( "apontamento.clientesSelecionado",		opts[:"Cliente"] )

		elsif opts[:"Tipo"] == "AVULSO" then
			@driver.find_element(id: "tpApontamentoAvulso").click
			enterText( "apontamento.nomeClienteSelecionadoAvulso",	opts[:"Cliente"] )
			sleep(0.4)
			begin
				if @driver.find_element(:xpath, '//*[contains(@class, "ui-menu-item")]').text.include?(opts[:"Cliente"]) then
					@driver.find_element(:xpath, '//*[contains(@class, "ui-menu-item")]').click
				end
			rescue StandardError => e
				@log.info "ERROR entering with text #{opts[:"Cliente"]} in #{ui-menu-item}"
				@log.info "--> Error \"#{e.message}\"."
				@log.info "#{e.backtrace}"
#				binding.pry if tries_cnt < 2
			end
			selectOption( "apontamento.tipoOperacaoSelecionado",	opts[:"Natureza da operação"] )
			selectOption( "apontamento.idTipoAtividadeAvulso",		opts[:"Tipo de Atividade"] )

		else
			$log.info "ERROR: Operation " + opts[:"Tipo"] + " not supported!"
		end

		# Dia e Duração
		enterText2( "apontamento_diario", "data", 					opts[:"Data"] )
		enterText2( "apontamento_diario", "apontamento.duracao",  	opts[:"Duração"] )

		# Comentarios - nao funciona
 		#@driver.find_element(:xpath, '//*[contains(@class, "mceContentBody")]').send_keys opts[:"Comentarios"]
		#enterText( "tinymce",	opts[:"Comentarios"] )
		#binding.pry

		# Click no Botao Incluir Novo Apontamento
		@driver.find_element(:xpath, '//*[contains(@name, "btnSalvar")]').click
		@wait.until { @driver.find_element(id: "incluirNovoApontamento").displayed? }

		# Monitora Toast Message - Resposta do Channel
		id_mon = "toast-message"
		found = false
		exceed = false
		try_cnt = 0
		while (!found) and (!exceed) do
		 	begin
				try_cnt = try_cnt + 1
				exceed = true if try_cnt>100
				found = ! @driver.find_element(:xpath, '//*[contains(@class, "'+ id_mon + '")]').nil?
		 	rescue
				sleep(0.1)
			end
		end
		result = @driver.find_element(:xpath, '//*[contains(@class, "'+ id_mon + '")]').text if found
		result = "# WARNING: #{id_mon} not found!" if !found
		$log.info result

		return result
	end

	def valid_date?( str, format="%d/%m/%Y" )
	  Date.strptime(str,format) rescue false
	end

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

	def close_web()
		@driver.quit
	end


end
