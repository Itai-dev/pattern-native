Pod::Spec.new do |s|
  s.name           = 'WatchBridge'
  s.version        = '1.0.0'
  s.summary        = 'Receives check-ins sent from the Pattern watch app'
  s.description    = 'Queues WatchConnectivity user-info transfers until the app JavaScript drains them into the record.'
  s.author         = 'Pattern'
  s.homepage       = 'https://github.com/Itai-dev/pattern-native'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.swift_version = '5.4'
end
