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
require 'json'
require 'csv'
require 'cli'
require 'pry'
require 'tty-prompt'
require_relative 'Ahgora'
require_relative 'Channel'
require_relative 'Expert'
require_relative 'stdoutlog'

# switches
$debug			= false
$year_process	= false
$show_browser	= false

STDOUT.sync = true
$timestamp = Time.new.strftime("%Y%m%d_%H%M%S")
$log_file_name = "log/FAZ_APONTAMENTOS_" + $timestamp + ".log"
$log = StdoutLog.new($debug, $log_file_name)

# Check Command Line Arguments
settings = CLI.new do

	description	"This script fills the channel."

	switch	:debug,			:short => :d,	:required => false,	:description => "Enables debug information"
	switch	:show_browser,	:short => :s,	:required => false,	:description => "Show Browser"
	switch	:year,			:short => :y,	:required => false,	:description => "Process all months of current year. Otherwise only current month."

	option	:apw_ahgora,	:short => :a,	:required => false,	:description => "Ahgora password"
	option	:apw_channel,	:short => :c,	:required => false,	:description => "Channel password"

	option	:import_csv,	:short => :i,	:required => false,	:description => "CSV file"


end.parse! do |settings|
	# switches
	$debug			= true if !settings.debug.nil?
	$year_process	= true if !settings.year.nil?
	$show_browser	= true if !settings.show_browser.nil?

	# options
	$apw_ahgora		= settings.apw_ahgora if !settings.apw_ahgora.nil?
	$apw_channel	= settings.apw_channel if !settings.apw_channel.nil?
	$import_csv		= settings.import_csv if !settings.import_csv.nil?
end

# Enable debug
$log.set_debug_info($debug)

# Main
prompt = TTY::Prompt.new
$apw_ahgora = prompt.mask("Enter your password for Ahgora?") if $apw_ahgora.nil?
$apw_channel = prompt.mask("Enter your password for Channel?") if $apw_channel.nil?

choices = [
	{ key: 'y', name: 'insere novo apontamento', value: :yes },
	{ key: 'n', name: 'não insere apontamento', value: :no },
	{ key: 'a', name: 'insere TODOS os novos apontamentos', value: :all },
	{ key: 'q', name: 'quit', value: :quit }
  ]


#tbd - speedup - rodar o get_batidas em // do ahgora e do channel

if ($import_csv.nil?) then
	$log.info("# -------------------------------------------")
	$log.info("# Obtem batidas do Ahgora (PONTO ELETRONICO)")
	$log.info("# -------------------------------------------")
	
	ahgora = Ahgora.new( true, $show_browser )
	ahgora.set_timestap($timestamp)
	ahgora.set_log($log)
	ahgora.open_web_session()
	ahgora.web_login($apw_ahgora)
	ahgora_bats = ahgora.get_batidas($year_process)
	
	$log.debug( ahgora_bats.inspect )
	ahgora_bats.sort!.each { |l| $log.info( [l[0],l[2]].join(", ") + "\t[" + l[3].join(", ") + "]") }
	# [dia, horas_trab i, horas_trab str]
	
	
	$log.info("# -------------------------------------------")
	$log.info("# Obtem apontamentos atuais do Channel")
	$log.info("# -------------------------------------------")
	channel = Channel.new( true, $show_browser )
	channel.set_timestap($timestamp)
	channel.set_log($log)
	channel.open_web_session()
	channel.web_login($apw_channel)
	channel_bats = channel.get_batidas($year_process)
	
	$log.debug( channel_bats.inspect )
	channel_bats.sort!.each { |l| $log.info( [l[0],l[2]].join(", ") ) }
	# [dia, horas_trab i, horas_trab str]
	
	
	
	$log.info("# -------------------------------------------")
	$log.info("# Ahgora x Channel - Analise")
	$log.info("# -------------------------------------------")
	d = Date.today
	
	ctmp = channel_bats.map { |a| [a[0],a[2]] }
	hash_channel_bats = ctmp.to_h
	keys_channel = hash_channel_bats.keys.sort
	
	ctmp = ahgora_bats.map { |a| [a[0],a[2]] }
	hash_ahgora_bats = ctmp.to_h
	keys_ahgora = hash_ahgora_bats.keys.sort
	
	#binding.pry
	
	new_bats = []
	# para cada ponto no ahgora
	keys_ahgora.each { |kahgora|
		kahgora_str = kahgora.strftime("%d/%m/%Y")
		v_ahgora = hash_ahgora_bats[kahgora]
		## verifica se nao existe apontamento no channel entao é novo apontamento
		if ! keys_channel.include?( kahgora ) then
			$log.info "#{kahgora_str} #{hash_ahgora_bats[kahgora]} (ahgora): channel novo apontamento!"
			new_bats.push [kahgora_str, hash_ahgora_bats[kahgora] ]
		## se ja foi apontado entao apenas compara o valor das horas
		else
			v_channel = hash_channel_bats[kahgora]
			if  v_channel == v_ahgora then
				## show correct values apontados
				$log.info "#{kahgora_str}: #{v_channel} ok"
			else
				## show wrong values apontados
				$log.info "#{kahgora_str}: #{v_ahgora} (ahgora) != #{v_channel} (channel)"
			end
		end
	}
	
	$log.info("# -------------------------------------------")
	$log.info("# Insere novos apontamentos")
	$log.info("# -------------------------------------------")
	
	# Usa classe expert que faz associação das atividades
	expert = Expert.new( false )
	expert.set_timestap($timestamp)
	expert.set_log($log)
	#binding.pry

	flag_all = false
	new_bats.each { |n|
		# Obtem apontamentos do expert
		appointments = expert.associaProjeto( n[0], n[1] )
		appointments.each { |opts|
			flag_insert = false
			if flag_all
				flag_insert = true
				sleep(2)
			else
				puts("\n-> #{opts.inspect}")
				case prompt.expand('-> Insere novo apontamento?', choices)
					when :yes
						flag_insert = true
					when :no
						flag_insert = false
						$log.info("# ignoring #{opts.inspect}")
					when :all
						flag_insert = true
						flag_all = true
					when :quit
						break n
				end
			end
			channel.push_batida( opts ) if flag_insert
		}
	}

else
	$log.info("# -------------------------------------------")
	$log.info("# Reading CSV file")
	$log.info("# -------------------------------------------")
	appointments = CSV.parse(File.read($import_csv), headers: true)
	
	# binding.pry

	$log.info("# -------------------------------------------")
	$log.info("# Conectando com Channel")
	$log.info("# -------------------------------------------")
	channel = Channel.new( true, $show_browser )
	channel.set_timestap($timestamp)
	channel.set_log($log)
	channel.open_web_session()
	channel.web_login($apw_channel)

	flag_all = false
	appointments.each { |topts|
		opts={}
		# binding.pry
		opts[:"Tipo"] 				= topts["Tipo"] 
		opts[:"Projeto"] 			= topts["Projeto"]
		opts[:"Tipo de Atividade"] 	= topts["Tipo de Atividade"]
		opts[:"Associar Atividade"] = topts["Associar Atividade"]
		opts[:"Associar tarefa"] 	= topts["Associar tarefa"]
		opts[:"Data"] 				= topts["Data"]
		opts[:"Duração"] 			= topts["Duração"]
		opts[:"Comentarios"] 		= topts["Comentarios"]
		puts opts.inspect

		flag_insert = false
		if flag_all
			flag_insert = true
			sleep(2)
		else
			puts("\n-> #{opts.inspect}")
			case prompt.expand('-> Insere novo apontamento?', choices)
				when :yes
					flag_insert = true
				when :no
					flag_insert = false
					$log.info("# ignoring #{opts.inspect}")
				when :all
					flag_insert = true
					flag_all = true
				when :quit
					break n
			end
		end
		channel.push_batida( opts ) if flag_insert
	}
end




