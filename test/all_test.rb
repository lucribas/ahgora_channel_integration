require 'minitest/autorun'
require 'open3'
require 'rbconfig'
require File.expand_path('../source/Expert', __dir__)

class AppConfigTest < Minitest::Test
	CONFIG_KEYS = %w[
		CHANNEL_DEFAULT_PROJECT CHANNEL_DEFAULT_ACTIVITY
		CHANNEL_DEFAULT_ACTIVITY_TYPE CHANNEL_DEFAULT_TASK
	].freeze

	def setup
		@original = CONFIG_KEYS.to_h { |key| [key, ENV[key]] }
		CONFIG_KEYS.each { |key| ENV.delete(key) }
	end

	def teardown
		@original.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
	end

	def test_missing_required_configuration_has_actionable_error
		error = assert_raises(AppConfig::MissingConfiguration) { AppConfig.expert_project }
		assert_includes error.message, 'CHANNEL_DEFAULT_PROJECT'
	end

	def test_expert_maps_all_hours_to_configured_project
		ENV['CHANNEL_DEFAULT_PROJECT'] = 'P123'
		ENV['CHANNEL_DEFAULT_ACTIVITY'] = '1.2.3'
		opts = Expert.new.associaProjeto('18/08/2026', '07:30').first

		assert_equal 'P123', opts[:Projeto]
		assert_equal '1.2.3', opts[:'Associar Atividade']
		assert_equal '07:30', opts[:Duração]
	end
end

class CliIntegrationTest < Minitest::Test
	ROOT = File.expand_path('..', __dir__)
	ENTRYPOINT = File.join(ROOT, 'source/faz_apontamentos.rb')
	CSV_FILE = File.join(ROOT, 'source/apontamentos.csv')

	def test_csv_dry_run_is_offline_and_processes_every_row
		stdout, stderr, status = Open3.capture3(
			clean_environment,
			RbConfig.ruby, ENTRYPOINT, '--import-csv', CSV_FILE, '--dry-run',
			:chdir => ROOT
		)

		assert status.success?, stderr
		assert_includes stdout, 'Dry-run concluido: 22 apontamentos simulados'
		refute_includes stdout, 'navigate to'
	end

	def test_quit_stops_csv_without_writing_or_name_error
		support = File.join(ROOT, 'test/support/fake_channel.rb')
		env = clean_environment.merge(
			'CHANNEL_LOGIN_URL' => 'https://channel.invalid/login',
			'CHANNEL_EXTRATO_URL' => 'https://channel.invalid/extrato',
			'CHANNEL_USERNAME' => 'test',
			'TEST_PROMPT_ANSWER' => 'quit'
		)
		stdout, stderr, status = Open3.capture3(
			env,
			RbConfig.ruby, '-r', support, ENTRYPOINT, '-i', CSV_FILE, '-c', 'test',
			:chdir => ROOT
		)

		assert status.success?, stderr
		assert_includes stdout, 'TEST_PUSH_COUNT=0'
		refute_includes stderr, 'NameError'
	end

	private

	def clean_environment
		ENV.to_h.reject { |key, _value| key.start_with?('AHGORA_', 'CHANNEL_') }
	end
end
