
require 'selenium-webdriver'
require 'tty-prompt'
require 'date'
require_relative './vars'
require 'pry'

class Nolog
	def initialize( debug = false ) @debug = debug end
	def info(str) puts str end
	def debug(str) puts str if @debug end
end

class Ahgora

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
		# configure the @driver to run in headless mode
		options = Selenium::WebDriver::Chrome::Options.new
		options.add_argument('--headless') if !@show_browser

		@driver = Selenium::WebDriver.for :chrome, options: options

		# resize the window and take a screenshot
		@driver.manage.window.resize_to(1400, 2300)
	end

	def web_login(ahgora_password)
		#----- LOGIN -----
		@log.info "navigate to #{AHGORA_LOGIN_URL}"
		@driver.navigate.to AHGORA_LOGIN_URL

		@wait = Selenium::WebDriver::Wait.new(:timeout => 30)
		@wait.until { @driver.title.downcase.start_with? ":: ahgora" }

		#Enters with Login da Empresa and SUBMIT
		#@log.debuf @driver.title
		#element = @driver.find_element(name: 'empresa')
		#element.send_keys AHGORA_EMPRESA
		#element.submit

		# Enters with Login do Usuario and SUBMIT
		@log.debug @driver.title
		#@driver.execute_script("\$(\'button[type=submit]\').text(\'Entrar\');")
		#@driver.execute_script("\$(\'#login #matricula\').removeClass(\'hide\');")
		#@driver.execute_script("\$(\'#login #senha\').removeClass(\'hide\');")
		@wait.until { @driver.find_element(name: 'senha').displayed? }
		element = @driver.find_element(id: 'login').find_element(name: 'matricula')
		element.send_keys AHGORA_MATRICULA
		element = @driver.find_element(id: 'login').find_element(name: 'senha')
		element.send_keys ahgora_password
		element.submit

		#tbd testar se sucesso..

		#------ MENU
		@log.debug @driver.title
		@wait = Selenium::WebDriver::Wait.new(:timeout => 30)
		sleep 1
		@wait.until { @driver.title.downcase.start_with? ":: ahgora" }
	end


	def get_batidas( year_process )
		batidas = []


		if year_process == false then
			# -------------------------------------------
			# Pega os ultimos apontamentos apenas
			# -------------------------------------------

			# current_month = Time.new.strftime("%m-%Y")
			#----- BATIDAS -----
			@log.info "navigate to #{AHGORA_BATIDAS_URL}"
			@driver.navigate.to AHGORA_BATIDAS_URL
			@wait = Selenium::WebDriver::Wait.new(:timeout => 30)
			sleep 1
			@wait.until { @driver.title.downcase.start_with? ":: ahgora" }
			@log.debug @driver.title
			@log.debug "-----------------------------------------------------"
			batidas = process_batidas()
			# verifica se precisa buscar o proximo mes - a partir do dia 25
			if Time.new.strftime("%d").to_i > 25 then
				next_month = (Time.new + 31*24*3600).strftime("%m-%Y")

				#----- BATIDAS -----
				url = "https://www.ahgora.com.br/externo/batidas/#{next_month}"
				@log.info "navigate to #{url}"
				@driver.navigate.to url
				@wait = Selenium::WebDriver::Wait.new(:timeout => 30)
				sleep 1
				@wait.until { @driver.title.downcase.start_with? ":: ahgora" }
				@log.debug @driver.title
				@log.debug "-----------------------------------------------------"
				batidas = batidas + process_batidas()
			end
		else
			# -------------------------------------------
			# Pega desde o inicio do ano
			# -------------------------------------------
			# verifica se precisa buscar o proximo mes - a partir do dia 25
			current_year = (Time.new).strftime("%Y")
			next_month = ((Time.new + 31*24*3600).strftime("%m")).to_i
			for month in 1..next_month
				month_year = ("%.2d" % month) + "-" + ("%.4d" % current_year)
				#----- BATIDAS -----
				url = "https://www.ahgora.com.br/externo/batidas/#{month_year}"
				@log.info "navigate to #{url}"
				@driver.navigate.to url
				@wait = Selenium::WebDriver::Wait.new(:timeout => 30)
				sleep 1
				@wait.until { @driver.title.downcase.start_with? ":: ahgora" }
				@log.debug @driver.title
				@log.debug "-----------------------------------------------------"
				batidas = batidas + process_batidas()
			end
		end

		return batidas
	end

	def process_batidas()
		horas_trab = 0
		horas_neg = 0
		horas_pos = 0
		horas_saldo = 0
		horas_acc = 0
		horas_banco = 0
		batidas = []

		@wait.until { @driver.find_elements(:xpath => "//*[contains(@class,'table-batidas')]/tbody/tr") }

		# mes_batidas = @driver.find_elements(:xpath => "//*[contains(@id,'titulo_mes')]/span")

		titulo_mes = @driver.find_elements(:xpath => "//*[contains(@id,'titulo_mes')]")[0].text.strip.gsub("/","_")
		@log.info "month: #{titulo_mes}"

		table_batidas = @driver.find_elements(:xpath => "//*[contains(@class,'table-batidas')]/tbody/tr")
		@log.debug table_batidas.inspect
		begin @log.info "# ERROR: table-batidas not found!"; binding.pry; end if table_batidas.nil?
		table_batidas.each do |l|
			@log.debug "---------------------------------------"
			row_str = []
			l.find_elements(:xpath => "./td").each do |c|
				row_str.push(c.text)
				@log.debug "-->" + c.text + "<--"
			end

			if row_str.length > 0 then
				#binding.pry
				# parse lines
				header = row_str[0]
				if 	   header.start_with? "Horas Trabalhadas"
					horas_trab = parseTime( row_str[1] )
				elsif  header.start_with? "Horas mensais negativas"
					horas_neg = parseTime( row_str[1] )
				elsif  header.start_with? "Horas mensais positivas"
					horas_pos = parseTime( row_str[1] )
				elsif  header.start_with? "SALDO"
					horas_saldo = parseTime( row_str[1] )
				elsif  header.start_with? "Banco de horas acumulado"
					horas_acc = parseTime( row_str[1] )
				elsif  header.start_with? "Banco de horas no mês"
					horas_banco = parseTime( row_str[1] )
				else
					# batidas


					#0 -->29/07<--
					#1 -->Adm./ P&D - Adm./ P&D<--
					#2 -->09:14, 11:52, 12:53, 18:19<--
					#3 --><--
					#4 --><--
					#5 --><--
					#6 -->Horas Trabalhadas: 08:04
					#  Banco de Horas: 00:04<--
					#7 --><--

					if row_str[2].nil? then
						@log.info "# WARNING: unexpected value of row2 in: #{row_str}"
					else
						#0 -->29/07<--
						dia = valid_date?( "#{header.strip}/2020", "%d/%m/%Y" )
						if dia then
							#2 -->09:14, 11:52, 12:53, 18:19<--
							bat = []
							bat_str = []
							str_batidas = row_str[2].split(/, /)
							if str_batidas.nil? then
								@log.info "# WARNING: unexpected value of row2: #{row_str[2]}"
							else
								str_batidas.each do |t|
									bat.push( parseTime( t ) )
									bat_str.push( t )
								end
								#6 -->Horas Trabalhadas: 08:04
								#  Banco de Horas: 00:04<--
								if row_str[6].start_with?("Horas Trabalhadas:")
									spl = row_str[6].split(/: |\n/)
									if !spl[2].nil? and spl[2].start_with?("Banco de Horas")
										banco_horas = parseTime( spl[3] )
									end
									horas_trab = parseTime( spl[1] )
									batidas.push( [ dia, horas_trab, spl[1], bat_str, banco_horas ] )
								end
							end
						end

					end
				end
			end
		end

		#binding.pry

		@log.debug "-----------------------------------------------------"

		# resize the window and take a screenshot
		@driver.manage.window.resize_to(1200, 500+table_batidas.size*80)
		@driver.save_screenshot "log/Ahgora_screenshot_#{titulo_mes}_#{@timestamp}.png"

		return batidas
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
