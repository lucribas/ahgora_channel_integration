#!/usr/bin/env ruby

# Configuracao centralizada do projeto. Valores que identificam usuarios,
# empresas e ambientes devem ser fornecidos por variaveis de ambiente.
module AppConfig
	class MissingConfiguration < StandardError; end

	module_function

	def fetch(name, default = nil)
		value = ENV[name]
		value = default if value.nil? || value.strip.empty?
		return value unless value.nil? || value.to_s.strip.empty?

		raise MissingConfiguration,
			"Configure a variavel de ambiente #{name}. Consulte o README.md."
	end

	def optional(name, default = nil)
		value = ENV[name]
		return default if value.nil? || value.strip.empty?

		value
	end

	def ahgora_login_url
		fetch('AHGORA_LOGIN_URL')
	end

	def ahgora_batidas_url
		fetch('AHGORA_BATIDAS_URL')
	end

	def ahgora_mirror_url
		fetch('AHGORA_MIRROR_URL')
	end

	def ahgora_matricula
		fetch('AHGORA_MATRICULA')
	end

	def ahgora_punch_overrides
		optional('AHGORA_PUNCH_OVERRIDES')
	end

	def channel_login_url
		fetch('CHANNEL_LOGIN_URL')
	end

	def channel_extrato_url
		fetch('CHANNEL_EXTRATO_URL')
	end

	def channel_username
		fetch('CHANNEL_USERNAME')
	end

	def expert_project
		fetch('CHANNEL_DEFAULT_PROJECT')
	end

	def expert_activity
		fetch('CHANNEL_DEFAULT_ACTIVITY')
	end

	def expert_activity_type
		optional('CHANNEL_DEFAULT_ACTIVITY_TYPE', 'Nenhum')
	end

	def expert_task
		optional('CHANNEL_DEFAULT_TASK', 'Nenhum')
	end

	def chrome_binary
		optional('CHROME_BINARY')
	end

	def chromedriver_path
		optional('CHROMEDRIVER_PATH')
	end
end
