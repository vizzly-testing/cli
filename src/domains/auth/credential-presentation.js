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

export function showCredential(output, credential) {
  output.labelValue('Credential', credentialSourceLabel(credential.source));
  if (credential.authorization && output.isVerbose()) {
    output.hint(
      `Permissions: ${credential.authorization.scopes.join(', ') || 'None'}`
    );
  }
  if (credential.kind === 'project') {
    output.hint('This project token can access only its project.');
    if (credential.source === 'environment') {
      output.hint('VIZZLY_TOKEN takes precedence over your saved login.');
      output.hint('Unset VIZZLY_TOKEN to use your saved login.');
    } else if (credential.source === 'flag') {
      output.hint('Omit --token to use your saved login.');
    } else if (credential.source === 'config') {
      output.hint('Remove the configured token to use your saved login.');
    } else {
      output.hint('Run vizzly login to browse your account.');
    }
  }
}
