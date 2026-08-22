##############################################################################
# FILE NAME	: faz_apontamentos.rb
# TITLE		: Preenche o channel com base no Ahgora ou em um arquivo CSV
# PROJECT	: NA
# AUTHOR	: lus
# PURPOSE	: NA
# NOTES		: NA
###############################################################################

#require "win32ole"
require 'csv'
require 'cli'
require 'pry'
require 'tty-prompt'
require_relative 'Ahgora'
require_relative 'Channel'
require_relative 'Expert'
require_relative 'stdoutlog'

REQUIRED_CSV_HEADERS = [
	'Tipo', 'Projeto', 'Tipo de Atividade', 'Associar Atividade',
	'Associar tarefa', 'Data', 'Duração', 'Comentarios'
].freeze

def read_csv_appointments(path)
	table = CSV.parse(File.read(path), headers: true)
	missing_headers = REQUIRED_CSV_HEADERS - table.headers
	raise ArgumentError, "CSV sem as colunas: #{missing_headers.join(', ')}" unless missing_headers.empty?

	table.each_with_index.map do |row, index|
		line = index + 2
		raise ArgumentError, "Tipo invalido na linha #{line}: #{row['Tipo']}" unless %w[PROJETOS OPERACOES AVULSO].include?(row['Tipo'])
		Date.strptime(row['Data'], '%d/%m/%Y')
		raise ArgumentError, "Duracao invalida na linha #{line}: #{row['Duração']}" unless row['Duração']&.match?(/\A\d{1,3}:[0-5]\d\z/)

		{
			:"Tipo" => row['Tipo'],
			:"Projeto" => row['Projeto'],
			:"Tipo de Atividade" => row['Tipo de Atividade'],
			:"Associar Atividade" => row['Associar Atividade'],
			:"Associar tarefa" => row['Associar tarefa'],
			:"Data" => row['Data'],
			:"Duração" => row['Duração'],
			:"Comentarios" => row['Comentarios']
		}
	end
end

def validate_configuration(import_csv, dry_run)
	unless import_csv && dry_run
		AppConfig.channel_login_url
		AppConfig.channel_extrato_url
		AppConfig.channel_username
	end

	return unless import_csv.nil?

	AppConfig.ahgora_login_url
	AppConfig.ahgora_batidas_url
	AppConfig.ahgora_mirror_url
	AppConfig.ahgora_matricula
	AppConfig.expert_project
	AppConfig.expert_activity
end

def prepare_web_client(client, timestamp, log)
	client.set_timestap(timestamp)
	client.set_log(log)
	client.open_web_session
	client
end

def parse_period_month(value)
	return nil if value.nil?
	raise ArgumentError, 'Mes invalido: use o formato AAAA-MM' unless value.match?(/\A\d{4}-(?:0[1-9]|1[0-2])\z/)

	Date.strptime("#{value}-01", '%Y-%m-%d')
rescue Date::Error
	raise ArgumentError, 'Mes invalido: use o formato AAAA-MM'
end

def parse_period_date(value, option_name)
	return nil if value.nil?

	Date.iso8601(value)
rescue Date::Error
	raise ArgumentError, "Data invalida em #{option_name}: use o formato AAAA-MM-DD"
end

# switches
$debug = false
$year_process = false
$show_browser = false
$dry_run = false
$period_month_option = nil
$start_date_option = nil
$end_date_option = nil

STDOUT.sync = true
$timestamp = Time.new.strftime('%Y%m%d_%H%M%S')
$log_file_name = "log/FAZ_APONTAMENTOS_#{$timestamp}.log"
$log = StdoutLog.new($debug, $log_file_name)

settings = CLI.new do
	description 'Integra apontamentos do Ahgora com o Channel.'

	switch :debug, :short => :d, :required => false, :description => 'Exibe informacoes de debug'
	switch :show_browser, :short => :s, :required => false, :description => 'Exibe o navegador'
	switch :year, :short => :y, :required => false, :description => 'Processa o ano atual'
	switch :dry_run, :short => :n, :required => false, :description => 'Simula sem gravar no Channel'

	option :apw_ahgora, :short => :a, :required => false, :description => 'Senha do Ahgora'
	option :apw_channel, :short => :c, :required => false, :description => 'Senha do Channel'
	option :import_csv, :short => :i, :required => false, :description => 'Arquivo CSV'
	option :month, :short => :m, :required => false, :description => 'Mes do espelho no formato AAAA-MM'
	option :start_date, :required => false, :description => 'Inicio do periodo no formato AAAA-MM-DD'
	option :end_date, :required => false, :description => 'Fim do periodo no formato AAAA-MM-DD'
end.parse! do |parsed|
	$debug = true unless parsed.debug.nil?
	$year_process = true unless parsed.year.nil?
	$show_browser = true unless parsed.show_browser.nil?
	$dry_run = true unless parsed.dry_run.nil?
	$apw_ahgora = parsed.apw_ahgora unless parsed.apw_ahgora.nil?
	$apw_channel = parsed.apw_channel unless parsed.apw_channel.nil?
	$import_csv = parsed.import_csv unless parsed.import_csv.nil?
	$period_month_option = parsed.month unless parsed.month.nil?
	$start_date_option = parsed.start_date unless parsed.start_date.nil?
	$end_date_option = parsed.end_date unless parsed.end_date.nil?
end

$log.set_debug_info($debug)
prompt = TTY::Prompt.new
choices = [
	{ key: 'y', name: 'insere novo apontamento', value: :yes },
	{ key: 'n', name: 'nao insere apontamento', value: :no },
	{ key: 'a', name: 'insere TODOS os novos apontamentos', value: :all },
	{ key: 'q', name: 'sair', value: :quit }
]

ahgora = nil
channel = nil
dry_run_count = 0

begin
	$period_month = parse_period_month($period_month_option)
	$start_date = parse_period_date($start_date_option, '--start-date')
	$end_date = parse_period_date($end_date_option, '--end-date')
	raise ArgumentError, 'Use apenas uma das opcoes: --year ou --month' if $year_process && $period_month
	if $start_date.nil? != $end_date.nil?
		raise ArgumentError, 'Informe --start-date e --end-date em conjunto'
	end
	if $start_date && ($year_process || $period_month)
		raise ArgumentError, 'O intervalo de datas nao pode ser combinado com --year ou --month'
	end
	raise ArgumentError, 'A data inicial deve ser anterior ou igual a data final' if $start_date && $start_date > $end_date

	validate_configuration($import_csv, $dry_run)

	$apw_ahgora ||= ENV['AHGORA_PASSWORD']
	$apw_channel ||= ENV['CHANNEL_PASSWORD']
	$apw_ahgora = prompt.mask('Senha do Ahgora?') if $apw_ahgora.nil? && $import_csv.nil?
	$apw_channel = prompt.mask('Senha do Channel?') if $apw_channel.nil? && !($import_csv && $dry_run)

	if $import_csv.nil?
		$log.info('# Obtem batidas do Ahgora (PONTO ELETRONICO)')
		ahgora = prepare_web_client(Ahgora.new($debug, $show_browser), $timestamp, $log)
		ahgora.web_login($apw_ahgora)
		ahgora_bats = ahgora.get_batidas($year_process, $period_month, $start_date, $end_date)
		ahgora_bats.sort.each { |row| $log.info([row[0], row[2]].join(', ') + "\t[#{row[3].join(', ')}]") }

		$log.info('# Obtem apontamentos atuais do Channel')
		channel = prepare_web_client(Channel.new($debug, $show_browser), $timestamp, $log)
		channel.web_login($apw_channel)
		channel_bats = channel.get_batidas($year_process, $period_month, $start_date, $end_date)
		channel_bats.sort.each { |row| $log.info([row[0], row[2]].join(', ')) }

		hash_channel_bats = channel_bats.map { |row| [row[0], row[2]] }.to_h
		hash_ahgora_bats = ahgora_bats.map { |row| [row[0], row[2]] }.to_h
		new_bats = []
		hash_ahgora_bats.keys.sort.each do |day|
			day_string = day.strftime('%d/%m/%Y')
			if !hash_channel_bats.key?(day)
				$log.info "#{day_string} #{hash_ahgora_bats[day]} (ahgora): novo apontamento"
				new_bats << [day_string, hash_ahgora_bats[day]]
			elsif hash_channel_bats[day] == hash_ahgora_bats[day]
				$log.info "#{day_string}: #{hash_channel_bats[day]} ok"
			else
				$log.info "#{day_string}: #{hash_ahgora_bats[day]} (ahgora) != #{hash_channel_bats[day]} (channel)"
			end
		end

		expert = Expert.new($debug)
		expert.set_timestap($timestamp)
		expert.set_log($log)
		flag_all = false
		quit_requested = false
		new_bats.each do |new_bat|
			expert.associaProjeto(new_bat[0], new_bat[1]).each do |opts|
				if $dry_run
					dry_run_count += 1
					$log.info "[DRY-RUN] gravaria apontamento ##{dry_run_count}: #{opts.inspect}"
					next
				end

				answer = flag_all ? :yes : prompt.expand('Insere novo apontamento?', choices)
				case answer
				when :yes
					channel.push_batida(opts)
				when :all
					flag_all = true
					channel.push_batida(opts)
				when :no
					$log.info "# ignorado #{opts.inspect}"
				when :quit
					quit_requested = true
					break
				end
				sleep(2) if flag_all
			end
			break if quit_requested
		end
	else
		$log.info("# Leitura do CSV: #{$import_csv}")
		appointments = read_csv_appointments($import_csv)

		unless $dry_run
			channel = prepare_web_client(Channel.new($debug, $show_browser), $timestamp, $log)
			channel.web_login($apw_channel)
		end

		flag_all = false
		appointments.each do |opts|
			if $dry_run
				dry_run_count += 1
				$log.info "[DRY-RUN] gravaria apontamento ##{dry_run_count}: #{opts.inspect}"
				next
			end

			answer = flag_all ? :yes : prompt.expand('Insere novo apontamento?', choices)
			case answer
			when :yes
				channel.push_batida(opts)
			when :all
				flag_all = true
				channel.push_batida(opts)
			when :no
				$log.info "# ignorado #{opts.inspect}"
			when :quit
				break
			end
			sleep(2) if flag_all
		end
	end

	$log.info "# Dry-run concluido: #{dry_run_count} apontamentos simulados" if $dry_run
rescue AppConfig::MissingConfiguration, ArgumentError => e
	$log.error(e.message)
	exit(2)
ensure
	ahgora&.close_web
	channel&.close_web
	$log.close
end
