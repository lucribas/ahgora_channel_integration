##############################################################################
# FILE NAME	: faz_apontamentos.rb
# TITLE		: Preenche o channel com base no Ahgora
# PROJECT	: NA
# AUTHOR	: lus
# PURPOSE	: NA
# NOTES		: NA
###############################################################################

require "win32ole"
require "json"
require "CSV"
require 'cli'
require 'pry'
require "tty-prompt"
require_relative 'Ahgora'
require_relative 'Channel'
require_relative './../../../../scripts/log/stdoutlog'


$debug		= false
$apw		= nil

STDOUT.sync = true
$timestamp = Time.new.strftime("%Y%m%d_%H%M%S")
$log_file_name = "FAZ_APONTAMENTOS_" + $timestamp + ".log"
$log = StdoutLog.new($debug, $log_file_name)

# Check Command Line Arguments
settings = CLI.new do

	description	"This script creates the Traceability Links into DOORS."
	switch	:debug,			:short => :d,	:required => false,	:description => "Enables debug information"
	option	:apw_ahgora,	:short => :a,	:required => false,	:description => "Ahgora password"
	option	:apw_channel,	:short => :c,	:required => false,	:description => "Channel password"

end.parse! do |settings|
	$debug			= true if !settings.debug.nil?
	$log.debug( settings.inspect )
	$apw_ahgora		= settings.apw_ahgora if !settings.apw_ahgora.nil?
	$apw_channel	= settings.apw_channel if !settings.apw_channel.nil?
end

# Main
prompt = TTY::Prompt.new
$apw_ahgora = prompt.mask("Enter your password for Ahgora?") if $apw_ahgora.nil?
$apw_channel = prompt.mask("Enter your password for Channel?") if $apw_channel.nil?


$log.info("# -------------------------------------------")
$log.info("# Obtem batidas do Ahgora (PONTO ELETRONICO)")
$log.info("# -------------------------------------------")

ahgora = Ahgora.new( true )
ahgora.set_timestap($timestamp)
ahgora.set_log($log)
ahgora.open_web_session()
ahgora.web_login($apw_ahgora)
ah_bats = ahgora.get_batidas()

$log.debug( ah_bats.inspect )
ah_bats.sort!.each { |l| $log.info( [l[0],l[2]].join(", ") ) }
# [dia, horas_trab i, horas_trab str]


$log.info("# -------------------------------------------")
$log.info("# Obtem apontamentos atuais do Channel")
$log.info("# -------------------------------------------")
channel = Channel.new( true )
channel.set_timestap($timestamp)
channel.set_log($log)
channel.open_web_session()
channel.web_login($apw_channel)
ch_bats = channel.get_batidas()

$log.debug( ch_bats.inspect )
ch_bats.sort!.each { |l| $log.info( [l[0],l[2]].join(", ") ) }
# [dia, horas_trab i, horas_trab str]



$log.info("# -------------------------------------------")
$log.info("# Ahgora x Channel - Analise")
$log.info("# -------------------------------------------")
d = Date.today

ctmp = ch_bats.map { |a| [a[0],a[2]] }
hash_ch_bats = ctmp.to_h
keys_ch = hash_ch_bats.keys.sort

ctmp = ah_bats.map { |a| [a[0],a[2]] }
hash_ah_bats = ctmp.to_h
keys_ah = hash_ah_bats.keys.sort


#binding.pry

new_bats = []
# para cada ponto no ahgora
keys_ah.each { |kah|
	kah_str = kah.strftime("%d/%m/%Y")
	v2 = hash_ah_bats[kah]
	## verifica se existe apontamento no channel
	if ! keys_ch.include?( kah ) then
		$log.info "#{kah_str} #{hash_ah_bats[kah]} (ahgora): channel novo apontamento!"
		new_bats.push [kah_str, hash_ah_bats[kah] ]
	else
		v1 = hash_ch_bats[kah]
		if  v1 == v2 then
			## show correct values apontados
			$log.info "#{kah_str}: #{v1} ok"
		else
			## show wrong values apontados
			$log.info "#{kah_str}: #{v2} (ahgora) != #{v1} (channel)"
		end
	end
}

$log.info("# -------------------------------------------")
$log.info("# Insere novos apontamentos")
$log.info("# -------------------------------------------")

opts = {}
opts[:"Projeto"] = "D15C35171.0"
opts[:"Tipo de Atividade"] = "Nenhum"
opts[:"Associar Atividade"] = "11.4.3.5.3"
opts[:"Associar tarefa"] = "Nenhum"

choices = [
  { key: 'y', name: 'insere novo apontamento', value: :yes },
  { key: 'n', name: 'não insere apontamento', value: :no },
  { key: 'a', name: 'insere TODOS os novos apontamentos', value: :all },
  { key: 'q', name: 'quit', value: :quit }
]

flag_all = false
new_bats.each { |n|
	opts[:"Data"] = n[0]
	opts[:"Duração"] = n[1]

	flag_insert = false
	if flag_all
		flag_insert = true
	else
		puts("#{opts.inspect}")
		case prompt.expand('Insere novo apontamento?', choices)
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
