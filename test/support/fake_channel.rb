require File.expand_path('../../source/Channel', __dir__)

class Channel
	@@test_push_count = 0

	def open_web_session; end
	def web_login(_password); end
	def close_web; end

	def push_batida(_opts)
		@@test_push_count += 1
	end

	def self.test_push_count
		@@test_push_count
	end
end

class TTY::Prompt
	def expand(*_args)
		ENV.fetch('TEST_PROMPT_ANSWER', 'quit').to_sym
	end
end

at_exit { puts "TEST_PUSH_COUNT=#{Channel.test_push_count}" }
