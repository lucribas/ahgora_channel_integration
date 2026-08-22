#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

# Carrega a configuracao local quando ela existir. Variaveis ja exportadas no
# terminal continuam sendo aceitas quando config.sh nao estiver presente.
if [[ -f "$script_dir/config.sh" ]]; then
	# shellcheck source=/dev/null
	source "$script_dir/config.sh"
fi

if ! command -v ruby >/dev/null 2>&1; then
	printf 'Erro: Ruby não foi encontrado no PATH.\n' >&2
	exit 127
fi

# Periodo solicitado: de 14 dias atras ate hoje, incluindo as duas datas.
periodo="$({ ruby -r date -e '
  fim = Date.today
  inicio = fim - 14
  print "#{inicio.iso8601} #{fim.iso8601}"
'; })"
read -r data_inicio data_fim <<< "$periodo"

printf 'Executando Ahgora e Channel de %s até %s (14 dias atrás até hoje).\n' \
	"$(ruby -r date -e 'print Date.iso8601(ARGV[0]).strftime("%d/%m/%Y")' "$data_inicio")" \
	"$(ruby -r date -e 'print Date.iso8601(ARGV[0]).strftime("%d/%m/%Y")' "$data_fim")"

bundler_command=''
for candidate in bundle bundle3.2 bundler; do
	if command -v "$candidate" >/dev/null 2>&1 && "$candidate" --version >/dev/null 2>&1; then
		bundler_command="$candidate"
		break
	fi
done

if [[ -n "$bundler_command" ]] && "$bundler_command" check >/dev/null 2>&1; then
	exec "$bundler_command" exec ruby source/faz_apontamentos.rb \
		--start-date "$data_inicio" --end-date "$data_fim" "$@"
fi

# Na primeira execucao, prepara o sistema e as gems pelo playbook local. O
# pedido de senha sudo ocorre apenas quando os pacotes ainda nao estao prontos.
run_prerequisites=true
for argument in "$@"; do
	if [[ "$argument" == '-h' || "$argument" == '--help' ]]; then
		run_prerequisites=false
		break
	fi
done

if [[ "$run_prerequisites" == true && -x "$(command -v ansible-playbook 2>/dev/null || true)" ]]; then
	ansible_options=(
		--inventory 'localhost,'
		--connection local
		--extra-vars "$(ruby -r json -e 'print JSON.generate({project_dir: ARGV.fetch(0)})' "$script_dir")"
	)
	if sudo -n true >/dev/null 2>&1; then
		:
	elif [[ -t 0 ]]; then
		ansible_options+=(--ask-become-pass)
	else
		printf 'Aviso: sem terminal interativo para solicitar a senha sudo; Ansible não executado.\n' >&2
		run_prerequisites=false
	fi

	if [[ "$run_prerequisites" == true ]]; then
		printf 'Preparando os pré-requisitos com Ansible...\n'
		if ansible-playbook "${ansible_options[@]}" ansible/instalar_prerequisitos.yml; then
			# O playbook pode instalar um executavel que nao existia no inicio.
			for candidate in bundle bundle3.2 bundler; do
				if command -v "$candidate" >/dev/null 2>&1 && \
					"$candidate" --version >/dev/null 2>&1 && \
					"$candidate" check >/dev/null 2>&1; then
					exec "$candidate" exec ruby source/faz_apontamentos.rb \
						--start-date "$data_inicio" --end-date "$data_fim" "$@"
				fi
			done
		else
			printf 'Aviso: o playbook não concluiu; tentando as gems já disponíveis.\n' >&2
		fi
	fi
elif [[ "$run_prerequisites" == true ]]; then
	printf 'Aviso: ansible-playbook não foi encontrado; tentando as gems já disponíveis.\n' >&2
fi

# Instalacoes antigas podem ter as gems em vendor/bundle para outra versao do
# Ruby. As gems Ruby puras e o Nokogiri empacotado continuam utilizaveis; para
# extensoes padrao (date, io-console e racc), preserva as versoes do Ruby atual.
vendored_libs=()
shopt -s nullglob
for lib_dir in "$script_dir"/vendor/bundle/ruby/*/gems/*/lib; do
	gem_dir="${lib_dir%/lib}"
	gem_name="${gem_dir##*/}"
	case "$gem_name" in
		date-*|io-console-*|racc-*) continue ;;
	esac
	vendored_libs+=("$lib_dir")
done
shopt -u nullglob

if (( ${#vendored_libs[@]} > 0 )); then
	vendored_rubylib="$(IFS=:; printf '%s' "${vendored_libs[*]}")"
	vendored_rubylib="${vendored_rubylib}${RUBYLIB:+:$RUBYLIB}"
	if RUBYLIB="$vendored_rubylib" ruby -e \
		"require 'cli'; require 'csv'; require 'date'; require 'pry'; require 'selenium-webdriver'; require 'tty-prompt'; require 'webdrivers/chromedriver'" \
		>/dev/null 2>&1; then
		printf 'Aviso: usando as gems compatíveis disponíveis em vendor/bundle.\n' >&2
		exec env RUBYLIB="$vendored_rubylib" ruby source/faz_apontamentos.rb \
			--start-date "$data_inicio" --end-date "$data_fim" "$@"
	fi
fi

printf 'Erro: as dependências Ruby não estão instaladas para %s.\n' "$(ruby -v)" >&2
if [[ -n "$bundler_command" ]]; then
	printf 'Instale-as com: %s install\n' "$bundler_command" >&2
else
	printf 'Instale o Bundler e execute: bundle install\n' >&2
fi
exit 1
