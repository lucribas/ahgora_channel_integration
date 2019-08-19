require "selenium-webdriver"
require "tty-prompt"
require_relative './vars'
require 'pry'


class Nolog
	def initialize( debug = false ) @debug = debug end
	def info(str) puts str end
	def debug(str) puts str if @debug end
end

class Channel

	def initialize( debug = false )
		@debug = debug
		@log = Nolog.new(debug)
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
		options.add_argument('--headless')

		@driver = Selenium::WebDriver.for :chrome, options: options

		# resize the window
		@driver.manage.window.resize_to(1400, 2300)

	end

	def web_login(channel_password)

		#----- LOGIN -----
		@driver.navigate.to CHANNEL_LOGIN_URL

		@wait = Selenium::WebDriver::Wait.new(:timeout => 10)
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
		@wait = Selenium::WebDriver::Wait.new(:timeout => 10)
		@wait.until { @driver.title.downcase.start_with? "channel" }

	end


	def get_batidas()

		batidas = []
		@wait = Selenium::WebDriver::Wait.new(:timeout => 10)

		#----- Acessar Extrato entre 01/01/2019 e dia de hoje -----
		@driver.navigate.to "https://channel.certi.org.br/channel/apontamento.do?action=listarDatas&retorno=painel"

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
		@wait = Selenium::WebDriver::Wait.new(:timeout => 10)

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
		@driver.save_screenshot "Channel_screenshot_#{@timestamp}.png"

		#@driver.find_element(id: 'login').submit
		return batidas
	end


	def selectOption( _id, _opt_to_select)
		element = @driver.find_element(id: _id)
		options = element.find_elements(tag_name: "option")
		found_ok = false
		options.each { |option| begin option.click; found_ok=true; break option; end if option.text.start_with?(_opt_to_select) }
		@log.info "ERROR selecting option #{_opt_to_select} in #{_id}" if !found_ok
	end


	def push_batida( opts )

		@log.info ("push_batida: " + opts.inspect)
		#
		# 		opts[:"Projeto"]
		# 		"D15C0171.0"
		# 		opts[:"Tipo de Atividade"]
		# 		"Nenhum tipo"
		# 		opts[:"Associar Atividade"]
		# 		"1.4.3.5.3 Detailed Design Review"
		# 		opts[:"Associar tarefa"]
		# 		"Nenhuma tarefa"
		# 		opts[:"Data"]
		# 		opts[:"Duração"]
		#
		# https://channel.certi.org.br/channel/apontamento.do?action=novo



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
			@driver.navigate.to "https://channel.certi.org.br/channel/apontamento.do?action=listarDatas&retorno=painel"
			@wait.until { @driver.find_element(id: "incluirNovoApontamento").displayed? }
		end

		#-- Click on Link "Incluir Novo Apontamento"
		@driver.find_element(id: "incluirNovoApontamento").click
		@wait.until { @driver.find_element(id: "apontamento_diario").displayed? }

		# Projeto
		selectOption( "apontamento.projetosSelecionado", opts[:"Projeto"] )

		#Tipo de Atividade
		selectOption( "apontamento.idTipoAtividadeProjeto", opts[:"Tipo de Atividade"] )

		#Associar Tarefa
		selectOption( "apontamento.notificacaoSelecionada", opts[:"Associar tarefa"] )

		# Dia e Duração
		dia_element = @driver.find_element(id: "apontamento_diario")
		element = dia_element.find_element(id: "data")
		element.clear
		element.send_keys opts[:"Data"]
		element = dia_element.find_element(id: "apontamento.duracao")
		element.clear
		element.send_keys opts[:"Duração"]

		#Associar Atividade - Ao mudar o Projeto ele é recarregado - precisa de um sleep
		sleep(0.3)
		selectOption( "apontamento.notificacaoSelecionada", opts[:"Associar Atividade"] )

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

	require 'date'
	def valid_date?( str, format="%m/%d/%Y" )
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
