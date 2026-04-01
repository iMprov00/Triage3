require './app'
require 'sinatra/activerecord/rake'

namespace :db do
  task :load_config do
    require './app'
  end
end

desc 'Заполнить БД начальными данными (первый администратор)'
task :seed do
  require './app'
  load File.expand_path('db/seeds.rb', __dir__)
end