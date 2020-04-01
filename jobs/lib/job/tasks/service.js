const getRouterTags = (name, taskName, jobName, scheme, lb) => {
  const tags = [];
  const domainName = lb.domain.replace(/\./g, '-');
  const service = `${jobName}-${taskName}-${name}-${domainName}`;
  const serviceTls = `${service}-tls`;

  const hostRule = `Host(\`${lb.domain}\`)`;
  tags.push(`traefik.http.routers.${service}.rule=${hostRule}`);

  if (scheme === 'https') tags.push(`traefik.http.services.${service}.loadbalancer.server.scheme=https`);
  if (lb.https_only) tags.push(`traefik.http.routers.${service}.middlewares=redirect-scheme@file`);

  if (lb.middleware) tags.push(`traefik.http.routers.${service}.middlewares=${lb.middleware.join(',')}`);
  if (lb.middleware && lb.cert) tags.push(`traefik.http.routers.${serviceTls}.middlewares=${lb.middleware.join(',')}`);

  if (lb.cert) {
    tags.push(
      `traefik.http.routers.${serviceTls}.rule=${hostRule}`,
      `traefik.http.routers.${serviceTls}.tls=true`,
      `traefik.http.routers.${serviceTls}.tls.certresolver=${lb.cert.replace('.', '-')}`,
      `traefik.http.routers.${serviceTls}.tls.domains[0].main=*.${lb.cert}`,
      `traefik.http.routers.${serviceTls}.tls.domains[0].sans=${lb.cert}`
    );
  }

  return tags;
}

const getServiceTags = (name, taskName, jobName, lb) => {
  if (!lb) return [];
  const tags = [];
  const service = `${taskName}-${jobName}-${name}`;
  if (lb.sticky) {
    tags.push(
      `traefik.http.services.${service}.loadBalancer.sticky=true`,
      `traefik.http.services.${service}.loadBalancer.sticky.cookie.name=${service}`,
      `traefik.http.services.${service}.loadBalancer.sticky.cookie.secure=false`,
      `traefik.http.services.${service}.loadBalancer.sticky.cookie.httpOnly=true`
    );
  } else {
    tags.push(`traefik.http.services.${service}.loadBalancer.sticky=false`);
  }
  return tags;
}

const getName = (jobName, taskName, portName) => {
  const result = [ jobName ];
  if (taskName !== jobName) result.push(taskName);
  if (portName !== result[result.length - 1]) result.push(portName);
  return result.join('-');
}

module.exports = (task, jobName) => {
  if (!task.ports) return [];
  return Object.keys(task.ports)
    .map((name) => ({ name, ...task.ports[name]}))
    .map((port) => ({
      Name: getName(jobName, task.name, port.name),
      PortLabel: port.name,
      AddresssMode: 'auto',
      CanaryTags: [ "traefik.enable=false" ],
      Tags: [
        `scheme=${port.scheme || 'http'}`,
        (port.lb && port.lb ? 'traefik.enable=true' : 'traefik.enable=false'),
        ...getServiceTags(port.name, task.name, jobName, port.lb),
        ...(port.lb ? (
            (Array.isArray(port.lb) ? port.lb : [port.lb])
              .map((lb) => getRouterTags(port.name, task.name, jobName, port.scheme, lb))
              .reduce((a, b) => [...a, ...b], [])
          ) : []),
        ...(port.tags || []),
      ]
    }))

}