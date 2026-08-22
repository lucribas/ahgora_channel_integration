
require 'selenium-webdriver'
require 'webdrivers/chromedriver'
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
		# O log detalhado do Selenium inclui os valores enviados aos campos do
		# formulario. Mantenha-o em WARN para nunca registrar credenciais.
		Selenium::WebDriver.logger.level = :warn
		Webdrivers.logger.level = :warn

		#sheet cheat https://gist.github.com/kenrett/7553278
		#@driver = Selenium::WebDriver.for :chrome
		# configure the @driver to run in headless mode
		options = Selenium::WebDriver::Chrome::Options.new
		options.add_argument('--headless=new') if !@show_browser
		options.add_argument('--window-size=1400,2300')
		options.binary = AppConfig.chrome_binary unless AppConfig.chrome_binary.nil?

		@driver = Selenium::WebDriver.for :chrome, options: options, service: chrome_service

		# resize the window and take a screenshot
		@driver.manage.window.resize_to(1400, 2300)
	end

	def web_login(ahgora_password)
		#----- LOGIN -----
		@log.info "navigate to #{AppConfig.ahgora_login_url}"
		@driver.navigate.to AppConfig.ahgora_login_url

		@wait = Selenium::WebDriver::Wait.new(:timeout => 30)
		@wait.until { ahgora_page? }

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
		@wait.until { @driver.find_element(id: 'boxLogin').find_element(name: 'senha').displayed? }
		login_form = @driver.find_element(id: 'boxLogin')
		element = login_form.find_element(name: 'matricula')
		element.send_keys AppConfig.ahgora_matricula
		element = login_form.find_element(name: 'senha')
		element.send_keys ahgora_password
		element.submit

		# Aguarda o formulario de login desaparecer. O titulo atual permanece
		# "TOTVS RH Ponto Eletronico - Linha Ahgora" depois da autenticacao.
		@wait.until do
			@driver.find_elements(id: 'boxLogin').none?(&:displayed?)
		end
		@log.debug @driver.title
	end


	def get_batidas( year_process, period_month = nil, start_date = nil, end_date = nil )
		last_closed_month = period_month || (Date.today << 1)
		months = if start_date && end_date
			mirror_months_for(start_date, end_date)
		elsif year_process
			(Date.new(last_closed_month.year, 1, 1)..last_closed_month)
				.select { |date| date.day == 1 }
		else
			[last_closed_month]
		end

		batidas = months.flat_map { |month| process_mirror_month(month) }
		return batidas unless start_date && end_date

		batidas.select { |row| row[0].between?(start_date, end_date) }
	end

	def mirror_months_for(start_date, end_date)
		first_month = mirror_month_for(start_date)
		last_month = mirror_month_for(end_date)
		(first_month..last_month).select { |date| date.day == 1 }
	end

	def mirror_month_for(date)
		month = Date.new(date.year, date.month, 1)
		date.day >= 26 ? (month >> 1) : month
	end

	def process_batidas_legacy()
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
		ano_batidas = titulo_mes[/(?:19|20)\d{2}/] || Date.today.year.to_s
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
						dia = valid_date?( "#{header.strip}/#{ano_batidas}", "%d/%m/%Y" )
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

	def process_mirror_month(month)
		@driver.switch_to.default_content
		@log.info "navigate to #{AppConfig.ahgora_mirror_url}"
		@driver.navigate.to AppConfig.ahgora_mirror_url
		@wait = Selenium::WebDriver::Wait.new(:timeout => 30)
		frame = @wait.until { @driver.find_element(id: 'mirror') }
		@driver.switch_to.frame(frame)
		@wait.until { @driver.find_element(tag_name: 'body').text.include?('MONTHLY SUMMARY') }

		select_mirror_month(month)
		monthly_summary = @driver.find_elements(tag_name: 'button').find do |button|
			button.text.include?('MONTHLY SUMMARY')
		end
		monthly_summary.click if monthly_summary
		@wait.until { @driver.find_element(tag_name: 'body').text.include?('Horas Trabalhadas') }

		body = @driver.find_element(tag_name: 'body').text
		@driver.save_screenshot "log/Ahgora_screenshot_#{month.strftime('%Y_%m')}_#{@timestamp}.png"
		batidas = parse_mirror_calendar(body, month)
		@log.info "Ahgora: #{batidas.size} dias obtidos para #{month.strftime('%m/%Y')}"
		batidas
	ensure
		@driver.switch_to.default_content
	end

	def select_mirror_month(month)
		month_names = %w[JANUARY FEBRUARY MARCH APRIL MAY JUNE JULY AUGUST SEPTEMBER OCTOBER NOVEMBER DECEMBER]
		month_abbreviations = %w[JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC]
		target_label = "#{month_names[month.month - 1]}/#{month.year}"
		return if @driver.find_element(tag_name: 'body').text.include?(target_label)

		selector = @driver.find_elements(tag_name: 'button').find do |button|
			button.text.match?(/[A-Z]+\/\d{4}/)
		end
		raise 'Seletor de mes do Ahgora nao encontrado' unless selector
		selector.click

		current_year = Date.today.year
		while current_year != month.year
			direction = current_year > month.year ? 'chevron_left' : 'chevron_right'
			button = @driver.find_elements(tag_name: 'button').find { |candidate| candidate.text.strip == direction }
			raise "Controle de ano #{direction} nao encontrado" unless button
			button.click
			current_year += current_year > month.year ? -1 : 1
		end

		abbreviation = month_abbreviations[month.month - 1]
		clicked = @driver.execute_script(<<~JS, abbreviation)
			var abbreviation = arguments[0];
			var button = Array.from(document.querySelectorAll('button')).find(function(element) {
				return (element.innerText || '').trim().toUpperCase() === abbreviation;
			});
			if (!button) return false;
			button.click();
			return true;
		JS
		raise "Mes #{abbreviation} nao encontrado" unless clicked
		@wait.until { @driver.find_element(tag_name: 'body').text.include?(target_label) }
	end

	def parse_mirror_calendar(body, month)
		lines = body.lines.map(&:strip).reject(&:empty?)
		calendar_start = lines.index('Saturday')
		raise 'Inicio do calendario do Ahgora nao encontrado' unless calendar_start
		calendar_start += 1
		summary_start = (calendar_start...lines.size).find { |index| lines[index] == 'MONTHLY SUMMARY' }
		raise 'Resumo mensal do Ahgora nao encontrado' unless summary_start
		tokens = lines[calendar_start...summary_start]

		previous_month = month << 1
		period_start = Date.new(previous_month.year, previous_month.month, 26)
		period_end = Date.new(month.year, month.month, 25)
		position = 0

		(period_start..period_end).filter_map do |date|
			day_position = (position...tokens.size).find { |index| tokens[index] == date.day.to_s }
			raise "Dia #{date.strftime('%d/%m/%Y')} nao encontrado no calendario" unless day_position
			position = day_position + 1
			position += 1 if tokens[position]&.match?(/\A[A-Za-z]{3}\z/)
			position += 1 if tokens[position] == 'star'

			raw_times = []
			while tokens[position]&.match?(/\A\d{2}:\d{2}\z/)
				raw_times << tokens[position]
				position += 1
			end
			times = punch_override_for(date) || raw_times
			next if times.empty?
			if times.size.odd?
				@log.info "# WARNING: #{date.strftime('%d/%m/%Y')} ignorado: quantidade impar de batidas [#{times.join(', ')}]"
				next
			end

			minutes = times.each_slice(2).sum do |start_time, end_time|
				time_to_minutes(end_time) - time_to_minutes(start_time)
			end
			duration = format('%02d:%02d', minutes / 60, minutes % 60)
			[date, minutes / 60.0, duration, times, 0.0]
		end
	end

	def time_to_minutes(value)
		hours, minutes = value.split(':').map(&:to_i)
		hours * 60 + minutes
	end

	def punch_override_for(date)
		raw_overrides = AppConfig.ahgora_punch_overrides
		return nil if raw_overrides.nil?

		date_text = date.strftime('%d/%m/%Y')
		entry = raw_overrides.split(';').find { |item| item.split('=', 2).first&.strip == date_text }
		return nil if entry.nil?

		_times_date, times_text = entry.split('=', 2)
		times = times_text.to_s.split(',').map(&:strip)
		unless times.any? && times.all? { |time| time.match?(/\A\d{2}:\d{2}\z/) }
			raise ArgumentError, "Override de batidas invalido para #{date_text}"
		end

		@log.info "Ahgora: usando override de batidas para #{date_text} [#{times.join(', ')}]"
		times
	end

	def valid_date?( str, format="%d/%m/%Y" )
	  Date.strptime(str,format) rescue false
	end

	def parseTime( str )
		sign = str.start_with?("-") ? -1 : 1
		sp = str.split(":")
		if sp.length!=2 then
			raise ArgumentError, "Formato de duracao invalido: #{str}"
		end
		value = sign*(sign*sp[0].to_i*60+sp[1].to_i)/60.0
		@log.debug "parseTime ==>#{str} : %.2f<===" % value
		return value
	end

	def close_web()
		@driver&.quit
	end

	private

	def chrome_service
		path = AppConfig.chromedriver_path
		return Selenium::WebDriver::Service.chrome unless path

		Selenium::WebDriver::Service.chrome(path: path)
	end

	def ahgora_page?
		@driver.title.downcase.include?('ahgora')
	end

end
