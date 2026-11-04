let sources = {
  flag: '--token',
  environment: 'VIZZLY_TOKEN',
  config: 'configuration',
  'linked-project': 'linked project',
  user: 'saved user login',
  anonymous: 'anonymous access',
};

export function credentialSourceLabel(source) {
  return sources[source] || source;
}

export function showCredential(output, credential, command) {
  output.hint(`Using ${credentialSourceLabel(credential.source)}`);
  if (credential.kind === 'project') {
    output.hint('This project token can access only its project.');
    output.hint(`Browse your account: vizzly ${command} --auth user`);
  }
}
