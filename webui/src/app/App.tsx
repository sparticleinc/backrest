import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  FiCalendar,
  FiDatabase,
  FiPlus,
  FiCheckCircle,
  FiAlertTriangle,
  FiSettings,
  FiLoader,
  FiServer,
  FiEdit2,
  FiMenu,
  FiHome,
  FiChevronRight,
} from 'react-icons/fi';

import { Box, Flex, Button, Text, Spinner, IconButton } from '@chakra-ui/react';
import { Tooltip } from '../components/ui/tooltip';
import { keyframes } from '@emotion/react';

import {
  AccordionRoot,
  AccordionItem,
  AccordionItemTrigger,
  AccordionItemContent,
} from '../components/ui/accordion';
import {
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
} from '../components/ui/drawer';
import { Config, Plan, Repo } from '../../gen/ts/v1/config_pb';
import { alerts } from '../components/common/Alerts';
import { useShowModal } from '../components/common/ModalManager';
import { OperationStatus } from '../../gen/ts/v1/operations_pb';
import { useResourceStatus } from '../api/resourceStatus';
import { keyBy } from '../lib/util';
import { Code } from '@connectrpc/connect';
import { LoginModal } from '../features/auth/LoginModal';
import { backrestService, syncStateService, getGBaseToken } from '../api/client';
import { useConfig } from './provider';
import { shouldShowSettings } from '../state/configutil';
import { OpSelector, OpSelectorSchema } from '../../gen/ts/v1/service_pb';
import { colorForStatus } from '../api/flowDisplayAggregator';
import { Route, Routes, useNavigate, useParams, useLocation } from 'react-router-dom';
import { MainContentAreaTemplate } from '../components/layout/MainContentArea';
import { create } from '@bufbuild/protobuf';
import {
  PeerState,
  PlanMetadata,
  RepoMetadata,
  SetRemoteClientConfigRequestSchema,
} from '../../gen/ts/v1sync/syncservice_pb';
import { useSyncStates } from '../state/peerStates';
import * as m from '../paraglide/messages';
import { EmptyState } from '../components/ui/empty-state';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const SummaryDashboard = React.lazy(() =>
  import('../features/dashboard/SummaryDashboard').then((m) => ({
    default: m.SummaryDashboard,
  })),
);

const PlanView = React.lazy(() =>
  import('../features/plans/PlanView').then((m) => ({
    default: m.PlanView,
  })),
);

const RepoView = React.lazy(() =>
  import('../features/repositories/RepoView').then((m) => ({
    default: m.RepoView,
  })),
);

const SelectorView = React.lazy(() =>
  import('../features/repositories/SelectorView').then((m) => ({
    default: m.SelectorView,
  })),
);

// Wrappers for consistent views with breadcrumbs and error handling
const RepoViewContainer = () => {
  const { repoId } = useParams();
  const [config, setConfig] = useConfig();

  if (!config) {
    return (
      <Box p={10}>
        <Spinner />
      </Box>
    );
  }

  const repo = config.repos.find((r) => r.id === repoId);

  return (
    <MainContentAreaTemplate
      breadcrumbs={[{ title: m.app_breadcrumb_repo() }, { title: repoId! }]}
      key={repoId}
    >
      {repo ? (
        <>
          {repo.originInstanceId && (
            <Box
              p={3}
              mb={4}
              borderRadius="md"
              bg="blue.50"
              borderWidth="1px"
              borderColor="blue.200"
              fontSize="sm"
              color="blue.800"
              _dark={{ bg: 'blue.950', borderColor: 'blue.800', color: 'blue.200' }}
            >
              {m.app_remote_repo_banner_prefix()}
              <strong>{repo.originInstanceId}</strong>
              {m.app_remote_repo_banner_suffix()}
            </Box>
          )}
          <RepoView repo={repo} />
        </>
      ) : (
        <EmptyState title={m.app_repo_not_found({ repoId: repoId || '' })} />
      )}
    </MainContentAreaTemplate>
  );
};

const RemoteRepoViewContainer = () => {
  const { peerInstanceId, repoId } = useParams();
  const peerStates = useSyncStates();

  // Peer state is used to find the right repo
  const peerState = peerStates.find((state) => state.peerInstanceId === peerInstanceId);
  const peerRepo = (peerState?.knownRepos || []).find((r) => r.id === repoId);

  return (
    <MainContentAreaTemplate
      breadcrumbs={[
        { title: m.app_breadcrumb_peer() },
        { title: peerInstanceId || m.app_unknown_peer() },
        { title: m.app_breadcrumb_repo() },
        { title: repoId || m.app_unknown_repo() },
      ]}
      key={`${peerInstanceId}-${repoId}`}
    >
      {peerRepo ? (
        <SelectorView
          title={m.app_remote_repo_title({ id: peerRepo.id })}
          sel={create(OpSelectorSchema, {
            originalInstanceKeyid: peerState?.peerKeyid,
            repoGuid: peerRepo.guid,
          })}
        />
      ) : (
        <EmptyState title={m.app_repo_not_found({ repoId: repoId || '' })} />
      )}
    </MainContentAreaTemplate>
  );
};

const RemotePlanViewContainer = () => {
  const { peerInstanceId, planId } = useParams();
  const peerStates = useSyncStates();

  const peerState = peerStates.find((state) => state.peerInstanceId === peerInstanceId);
  const peerPlan = (peerState?.knownPlans || []).find((p) => p.id === planId);

  return (
    <MainContentAreaTemplate
      breadcrumbs={[
        { title: m.app_breadcrumb_peer() },
        { title: peerInstanceId || m.app_unknown_peer() },
        { title: m.app_breadcrumb_plan() },
        { title: planId || '' },
      ]}
      key={`${peerInstanceId}-${planId}`}
    >
      {peerPlan ? (
        <SelectorView
          title={peerPlan.id}
          sel={create(OpSelectorSchema, {
            originalInstanceKeyid: peerState?.peerKeyid,
            planId: peerPlan.id,
          })}
        />
      ) : (
        <EmptyState title={m.app_plan_not_found({ planId: planId || '' })} />
      )}
    </MainContentAreaTemplate>
  );
};

const PlanViewContainer = () => {
  const { planId } = useParams();
  const [config, setConfig] = useConfig();

  if (!config) {
    return (
      <Box p={10}>
        <Spinner />
      </Box>
    );
  }

  const plan = config.plans.find((p) => p.id === planId);
  return (
    <MainContentAreaTemplate
      breadcrumbs={[{ title: m.app_breadcrumb_plan() }, { title: planId! }]}
      key={planId}
    >
      {plan ? (
        <PlanView plan={plan} />
      ) : (
        <EmptyState title={m.app_plan_not_found({ planId: planId || '' })} />
      )}
    </MainContentAreaTemplate>
  );
};

const PeerNavItem = ({
  icon,
  typeLabel,
  name,
  active,
  onClick,
  onEdit,
}: {
  icon: React.ReactNode;
  typeLabel: string;
  name: string;
  active: boolean;
  onClick: () => void;
  onEdit?: (e: React.MouseEvent) => void;
}) => (
  <Flex
    align="center"
    pl={14}
    pr={2}
    py={1}
    bg={active ? 'brand.muted' : undefined}
    color={active ? 'brand.solid' : undefined}
    _hover={{ bg: active ? 'brand.muted' : 'brand.subtle', color: 'brand.solid' }}
    cursor="pointer"
    className="group"
    onClick={onClick}
  >
    <Box flexShrink={0} mr={2}>
      {icon}
    </Box>
    <Text color={active ? 'brand.solid' : 'fg.muted'} fontSize="xs" flexShrink={0} mr={1}>
      {typeLabel}
    </Text>
    <Text fontSize="sm" flex="1" wordBreak="break-word">
      {name}
    </Text>
    {onEdit && (
      <Box opacity={0} _groupHover={{ opacity: 1 }} transition="opacity 0.2s">
        <IconButton
          size="xs"
          variant="ghost"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onEdit(e);
          }}
        >
          <FiEdit2 />
        </IconButton>
      </Box>
    )}
  </Flex>
);

const PeerInstanceSection = ({
  peerState,
  sel,
  remoteConfig,
  isActive,
  handleNav,
  handleRemoteRepoEdit,
  handleRemotePlanEdit,
}: {
  peerState: PeerState;
  sel: OpSelector;
  remoteConfig: PeerState['remoteConfig'];
  isActive: (path: string) => boolean;
  handleNav: (path: string) => void;
  handleRemoteRepoEdit: (repo: Repo) => void;
  handleRemotePlanEdit: (plan: Plan) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box mb={2}>
      <Flex
        align="center"
        pl={9}
        pr={2}
        py={1}
        cursor="pointer"
        _hover={{ bg: 'brand.subtle', color: 'brand.solid' }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Box
          transform={expanded ? 'rotate(90deg)' : undefined}
          transition="transform 0.2s"
          display="inline-flex"
          alignItems="center"
          mr={2}
          flexShrink={0}
        >
          <FiChevronRight size={14} />
        </Box>
        <Box flexShrink={0} mr={2}>
          <IconForResource selector={sel} />
        </Box>
        <Text fontWeight="bold" fontSize="sm">
          {peerState.peerInstanceId}
        </Text>
      </Flex>

      {expanded && (
        <>
          {peerState.knownRepos.map((repo: RepoMetadata) => {
            const repoPath = `/peer/${peerState.peerInstanceId}/repo/${repo.id}`;
            const editableRepo = remoteConfig?.repos?.find((r: Repo) => r.guid === repo.guid);
            return (
              <PeerNavItem
                key={repo.guid}
                icon={
                  <IconForResource
                    selector={create(OpSelectorSchema, {
                      originalInstanceKeyid: peerState.peerKeyid,
                      repoGuid: repo.guid,
                    })}
                  />
                }
                typeLabel={m.app_peer_nav_type_repo()}
                name={repo.id}
                active={isActive(repoPath)}
                onClick={() => handleNav(repoPath)}
                onEdit={editableRepo ? () => handleRemoteRepoEdit(editableRepo) : undefined}
              />
            );
          })}

          {peerState.knownPlans.map((planMeta: PlanMetadata) => {
            const planPath = `/peer/${peerState.peerInstanceId}/plan/${planMeta.id}`;
            const editablePlan = remoteConfig?.plans?.find((p: Plan) => p.id === planMeta.id);
            return (
              <PeerNavItem
                key={planMeta.id}
                icon={
                  <IconForResource
                    selector={create(OpSelectorSchema, {
                      originalInstanceKeyid: peerState.peerKeyid,
                      planId: planMeta.id,
                    })}
                  />
                }
                typeLabel={m.app_peer_nav_type_plan()}
                name={planMeta.id}
                active={isActive(planPath)}
                onClick={() => handleNav(planPath)}
                onEdit={editablePlan ? () => handleRemotePlanEdit(editablePlan) : undefined}
              />
            );
          })}
        </>
      )}
    </Box>
  );
};

const SidebarPlanItem = React.memo(
  ({
    plan,
    repoGuid,
    active,
    onNav,
    onEdit,
  }: {
    plan: Plan;
    repoGuid: string | undefined;
    active: boolean;
    onNav: (path: string) => void;
    onEdit: (plan: Plan) => void;
  }) => {
    const sel = useMemo(
      () =>
        create(OpSelectorSchema, {
          originalInstanceKeyid: '',
          planId: plan.id,
          repoGuid: repoGuid,
        }),
      [plan.id, repoGuid],
    );
    const planPath = `/plan/${plan.id}`;
    return (
      <Flex
        align="center"
        pl={9}
        pr={2}
        py={1}
        bg={active ? 'brand.muted' : undefined}
        color={active ? 'brand.solid' : undefined}
        _hover={{ bg: active ? 'brand.muted' : 'brand.subtle', color: 'brand.solid' }}
        className="group"
      >
        <Box flexShrink={0} mr={2}>
          <IconForResource selector={sel} />
        </Box>
        <Tooltip content={plan.id}>
          <Box flex="1" minW="0" cursor="pointer" onClick={() => onNav(planPath)} userSelect="none">
            <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
              {plan.id}
            </Text>
          </Box>
        </Tooltip>
        <Box opacity={0} _groupHover={{ opacity: 1 }} transition="opacity 0.2s">
          <IconButton
            size="xs"
            variant="ghost"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onEdit(plan);
            }}
          >
            <FiEdit2 />
          </IconButton>
        </Box>
      </Flex>
    );
  },
);

const SidebarRepoItem = React.memo(
  ({
    repo,
    instanceId,
    active,
    onNav,
    onEdit,
  }: {
    repo: Repo;
    instanceId: string;
    active: boolean;
    onNav: (path: string) => void;
    onEdit: (repo: Repo) => void;
  }) => {
    const sel = useMemo(
      () =>
        create(OpSelectorSchema, {
          instanceId: instanceId,
          repoGuid: repo.guid,
        }),
      [instanceId, repo.guid],
    );
    const repoPath = `/repo/${repo.id}`;
    return (
      <Flex
        align="center"
        pl={9}
        pr={2}
        py={1}
        bg={active ? 'brand.muted' : undefined}
        color={active ? 'brand.solid' : undefined}
        _hover={{ bg: active ? 'brand.muted' : 'brand.subtle', color: 'brand.solid' }}
        className="group"
      >
        <Box flexShrink={0} mr={2}>
          <IconForResource selector={sel} />
        </Box>
        <Tooltip content={repo.uri}>
          <Box flex="1" minW="0" cursor="pointer" onClick={() => onNav(repoPath)} userSelect="none">
            <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
              {repo.id}
            </Text>
            {repo.originInstanceId && (
              <Text
                fontSize="xs"
                color={active ? 'brand.solid' : 'fg.muted'}
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {repo.originInstanceId}
              </Text>
            )}
          </Box>
        </Tooltip>
        <Box opacity={0} _groupHover={{ opacity: 1 }} transition="opacity 0.2s">
          <IconButton
            size="xs"
            variant="ghost"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onEdit(repo);
            }}
          >
            <FiEdit2 />
          </IconButton>
        </Box>
      </Flex>
    );
  },
);

const SidebarContent = ({ onClose }: { onClose?: () => void }) => {
  const [config] = useConfig();
  const peerStates = useSyncStates();
  const showModal = useShowModal();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const isActive = (path: string) => location.pathname === path;

  const reposById = useMemo(
    () => (config ? keyBy(config.repos, (r) => r.id) : {}),
    [config?.repos],
  );

  // Replicate getSidenavItems functionality with Chakra components
  if (!config) return null;

  const configPlans = config.plans || [];
  const localRepos = (config.repos || []).filter((r) => !r.originInstanceId);
  const remoteRepos = (config.repos || []).filter((r) => !!r.originInstanceId);

  return (
    <Box
      minW="300px"
      maxW="400px"
      bg="bg.panel"
      boxShadow="panel"
      position="relative"
      zIndex={1}
      h="full"
      display="flex"
      flexDirection="column"
      flexShrink={0}
    >
      {/* BRAND / TITLE (left column top; drawer has its own header on mobile) */}
      {!onClose && (
        <Box
          as="a"
          cursor="pointer"
          onClick={() => handleNav('/')}
          px={4}
          h="60px"
          display="flex"
          alignItems="center"
          flexShrink={0}
          position="sticky"
          top={0}
          bg="bg.panel"
          zIndex={1}
        >
          <Text fontWeight="bold" fontSize="lg" whiteSpace="nowrap">
            GBase Onprem Backup
          </Text>
        </Box>
      )}

      {/* SCROLLABLE NAV AREA (grows to fill; footer stays pinned below) */}
      <Box flex="1" overflowY="auto" minH={0}>
      <AccordionRoot
        multiple
        defaultValue={['plans', 'repos', 'authorized-clients']}
        variant="plain"
        lazyMount
      >
        {/* DASHBOARD */}
        <Box
          cursor="pointer"
          onClick={() => handleNav('/')}
          px={4}
          py={2}
          bg={isActive('/') ? 'brand.muted' : undefined}
          color={isActive('/') ? 'brand.solid' : undefined}
          _hover={{ bg: isActive('/') ? 'brand.muted' : 'brand.subtle', color: 'brand.solid' }}
          userSelect="none"
        >
          <Flex align="center" gap={2}>
            <FiHome />
            <Text fontWeight="medium">{m.app_menu_dashboard()}</Text>
          </Flex>
        </Box>

        {/* PLANS SECTION */}
        <AccordionItem value="plans">
          <AccordionItemTrigger px={4} py={2} _hover={{ bg: 'brand.subtle', color: 'brand.solid' }}>
            <Flex align="center" gap={2}>
              <FiCalendar />
              <Text fontWeight="medium">{m.app_menu_plans()}</Text>
            </Flex>
          </AccordionItemTrigger>
          <AccordionItemContent pb={2}>
            <Button
              variant="ghost"
              size="sm"
              width="full"
              justifyContent="flex-start"
              _hover={{ bg: 'brand.subtle', color: 'brand.solid' }}
              onClick={async () => {
                const { AddPlanModal } = await import('../features/plans/AddPlanModal');
                showModal(<AddPlanModal template={null} />);
                onClose?.();
              }}
              pl={9}
              mb={1}
            >
              <FiPlus /> {m.app_menu_add_plan()}
            </Button>
            {configPlans.map((plan) => (
              <SidebarPlanItem
                key={plan.id}
                plan={plan}
                repoGuid={reposById[plan.repo]?.guid}
                active={isActive(`/plan/${plan.id}`)}
                onNav={handleNav}
                onEdit={async (plan) => {
                  const { AddPlanModal } = await import('../features/plans/AddPlanModal');
                  showModal(<AddPlanModal template={plan} />);
                  onClose?.();
                }}
              />
            ))}
          </AccordionItemContent>
        </AccordionItem>

        {/* REPOS SECTION */}
        <AccordionItem value="repos">
          <AccordionItemTrigger px={4} py={2} _hover={{ bg: 'brand.subtle', color: 'brand.solid' }}>
            <Flex align="center" gap={2}>
              <FiDatabase />
              <Text fontWeight="medium">{m.app_menu_repos()}</Text>
            </Flex>
          </AccordionItemTrigger>
          <AccordionItemContent pb={2}>
            <Button
              variant="ghost"
              size="sm"
              width="full"
              justifyContent="flex-start"
              _hover={{ bg: 'brand.subtle', color: 'brand.solid' }}
              onClick={async () => {
                const { AddRepoModal } = await import('../features/repositories/AddRepoModal');
                showModal(<AddRepoModal template={null} />);
                onClose?.();
              }}
              pl={9}
              mb={1}
            >
              <FiPlus /> {m.app_menu_add_repo()}
            </Button>
            {localRepos.map((repo) => (
              <SidebarRepoItem
                key={repo.id}
                repo={repo}
                instanceId={config.instance}
                active={isActive(`/repo/${repo.id}`)}
                onNav={handleNav}
                onEdit={async (repo) => {
                  const { AddRepoModal } = await import('../features/repositories/AddRepoModal');
                  showModal(<AddRepoModal template={repo} />);
                  onClose?.();
                }}
              />
            ))}
            {remoteRepos.length > 0 && (
              <>
                <Text fontSize="xs" fontWeight="bold" color="fg.muted" pl={9} pt={2} pb={1}>
                  {m.label_remote()}
                </Text>
                {remoteRepos.map((repo) => (
                  <SidebarRepoItem
                    key={repo.id}
                    repo={repo}
                    instanceId={config.instance}
                    active={isActive(`/repo/${repo.id}`)}
                    onNav={handleNav}
                    onEdit={async (repo) => {
                      const { AddRepoModal } =
                        await import('../features/repositories/AddRepoModal');
                      showModal(<AddRepoModal template={repo} />);
                      onClose?.();
                    }}
                  />
                ))}
              </>
            )}
          </AccordionItemContent>
        </AccordionItem>

        {/* REMOTE INSTANCES / AUTHORIZED CLIENTS */}
        {config.multihost?.authorizedClients?.length ? (
          <AccordionItem value="authorized-clients">
            <AccordionItemTrigger
              px={4}
              py={2}
              _hover={{ bg: 'brand.subtle', color: 'brand.solid' }}
            >
              <Flex align="center" gap={2}>
                <FiServer />
                <Text fontWeight="medium">{m.app_menu_remote_instances()}</Text>
              </Flex>
            </AccordionItemTrigger>
            <AccordionItemContent pb={2}>
              {peerStates.map((peerState) => {
                const sel = create(OpSelectorSchema, {
                  originalInstanceKeyid: peerState.peerKeyid,
                });

                const remoteConfig = peerState.remoteConfig;

                const handleRemoteRepoEdit = async (repo: Repo) => {
                  const { AddRepoModal } = await import('../features/repositories/AddRepoModal');
                  showModal(
                    <AddRepoModal
                      template={repo}
                      onSaveOverride={async (updatedRepo) => {
                        await syncStateService.setRemoteClientConfig(
                          create(SetRemoteClientConfigRequestSchema, {
                            peerKeyid: peerState.peerKeyid,
                            repos: [updatedRepo],
                          }),
                        );
                        alerts.success(m.app_remote_repo_updated());
                      }}
                    />,
                  );
                  onClose?.();
                };

                const handleRemotePlanEdit = async (plan: Plan) => {
                  const { AddPlanModal } = await import('../features/plans/AddPlanModal');
                  showModal(
                    <AddPlanModal
                      template={plan}
                      onSaveOverride={async (updatedPlan) => {
                        await syncStateService.setRemoteClientConfig(
                          create(SetRemoteClientConfigRequestSchema, {
                            peerKeyid: peerState.peerKeyid,
                            plans: [updatedPlan],
                          }),
                        );
                        alerts.success(m.app_remote_plan_updated());
                      }}
                    />,
                  );
                  onClose?.();
                };

                return (
                  <PeerInstanceSection
                    key={peerState.peerKeyid}
                    peerState={peerState}
                    sel={sel}
                    remoteConfig={remoteConfig}
                    isActive={isActive}
                    handleNav={handleNav}
                    handleRemoteRepoEdit={handleRemoteRepoEdit}
                    handleRemotePlanEdit={handleRemotePlanEdit}
                  />
                );
              })}
            </AccordionItemContent>
          </AccordionItem>
        ) : null}

        {/* SETTINGS */}
        <Box mt={4} mx={4}>
          <Button
            variant="outline"
            size="sm"
            width="full"
            justifyContent="flex-start"
            onClick={async () => {
              const { SettingsModal } = await import('../features/settings/SettingsModal');
              showModal(<SettingsModal />);
              onClose?.();
            }}
          >
            <FiSettings /> {m.app_menu_settings()}
          </Button>
        </Box>
      </AccordionRoot>
      </Box>

      {/* LANGUAGE SWITCHER：钉在侧栏左下角，切换会刷新整页 */}
      <Box flexShrink={0} px={4} py={3} bg="bg.panel">
        <LanguageSwitcher />
      </Box>
    </Box>
  );
};

const Sidebar = () => {
  return (
    <Box h="full" flexShrink={0} display={{ base: 'none', lg: 'block' }}>
      <SidebarContent />
    </Box>
  );
};

export const App: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useConfig();

  return (
    <Flex h="100vh">
      {/* LEFT COLUMN: SIDEBAR (brand title lives at its top) */}
      <Sidebar />

      {/* RIGHT COLUMN */}
      <Flex direction="column" flex="1" overflow="hidden">
        {/* TOP BAR — 透明底，露出画布，使左侧白色栏成为连续的一列 */}
        <Flex as="header" align="center" px={4} h="60px" color="fg" flexShrink={0}>
          {/* Mobile-only: hamburger + brand (sidebar is hidden on mobile) */}
          <Box display={{ base: 'block', lg: 'none' }} mr={2}>
            <MobileNavTrigger />
          </Box>
          <Box
            display={{ base: 'block', lg: 'none' }}
            as="a"
            cursor="pointer"
            onClick={() => navigate('/')}
            mr={4}
            fontWeight="bold"
            fontSize="lg"
            whiteSpace="nowrap"
          >
            GBase Onprem Backup
          </Box>
        </Flex>

        {/* CONTENT AREA */}
        <Box flex="1" overflowY="auto" bg="bg.canvas">
          <AuthenticationBoundary>
            <Suspense
              fallback={
                <Box p={10}>
                  <Spinner />
                </Box>
              }
            >
              <Routes>
                <Route
                  path="/"
                  element={
                    <MainContentAreaTemplate breadcrumbs={[]}>
                      <SummaryDashboard />
                    </MainContentAreaTemplate>
                  }
                />
                <Route path="/plan/:planId" element={<PlanViewContainer />} />
                <Route path="/repo/:repoId" element={<RepoViewContainer />} />
                <Route
                  path="/peer/:peerInstanceId/repo/:repoId"
                  element={<RemoteRepoViewContainer />}
                />
                <Route
                  path="/peer/:peerInstanceId/plan/:planId"
                  element={<RemotePlanViewContainer />}
                />
                <Route
                  path="/*"
                  element={
                    <MainContentAreaTemplate breadcrumbs={[]}>
                      <EmptyState title="404" description={m.app_page_not_found()} />
                    </MainContentAreaTemplate>
                  }
                />
              </Routes>
            </Suspense>
          </AuthenticationBoundary>
        </Box>
      </Flex>
    </Flex>
  );
};

const MobileNavTrigger = () => {
  const [open, setOpen] = useState(false);
  return (
    <DrawerRoot placement="start" open={open} onOpenChange={(e) => setOpen(e.open)}>
      <DrawerTrigger asChild>
        <IconButton variant="ghost" size="sm" aria-label={m.aria_menu()}>
          <FiMenu />
        </IconButton>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{m.app_menu_menu()}</DrawerTitle>
          <DrawerCloseTrigger />
        </DrawerHeader>
        <DrawerBody p={0}>
          <SidebarContent onClose={() => setOpen(false)} />
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  );
};

const AuthenticationBoundary = ({ children }: { children: React.ReactNode }) => {
  const [config, setConfig] = useConfig();
  const showModal = useShowModal();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // When set, counts down and then redirects to the origin root (the GBase
  // Onprem host page) so the user can (re-)login there.
  const [redirectSeconds, setRedirectSeconds] = useState<number | null>(null);
  // Marks GBase auth failures so the error page shows the friendly message
  // as its title instead of "failed to load config" + a raw HTTP error.
  const [isAuthError, setIsAuthError] = useState(false);

  useEffect(() => {
    if (redirectSeconds === null) return;
    if (redirectSeconds <= 0) {
      window.location.href = window.location.origin + "/";
      return;
    }
    const timer = setTimeout(() => setRedirectSeconds(redirectSeconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [redirectSeconds]);

  useEffect(() => {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(m.app_error_request_timeout())), 5000),
    );

    Promise.race([backrestService.getConfig({}), timeoutPromise])
      // @ts-ignore
      .then((config: Config) => {
        setConfig(config);
        if (shouldShowSettings(config)) {
          import('../features/settings/SettingsModal').then(({ SettingsModal }) => {
            showModal(<SettingsModal />);
          });
        } else {
          showModal(null);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setIsLoading(false);
        const code = err.code;
        if (err.code === Code.Unauthenticated) {
          // When embedded under GBase Onprem the token comes from the host
          // page; backrest's own login modal can't fix a rejected token.
          if (getGBaseToken()) {
            const message = m.auth_session_expired();
            setError(message);
            setIsAuthError(true);
            alerts.error(message, 0);
            setRedirectSeconds(5);
            return;
          }
          showModal(<LoginModal />);
          return;
        } else if (err.code !== Code.Unavailable && err.code !== Code.DeadlineExceeded) {
          // Insufficient GBase authority: show a friendly hint, no redirect —
          // logging in again wouldn't change the user's permissions.
          const isGBasePermissionDenied =
            err.code === Code.PermissionDenied && !!getGBaseToken();
          const message = isGBasePermissionDenied
            ? m.auth_permission_denied()
            : err.message;
          setError(message);
          setIsAuthError(isGBasePermissionDenied);
          alerts.error(message, 0);
          return;
        }

        setError(m.app_error_initial_config());
        alerts.error(m.app_error_initial_config(), 0);
      });
  }, []);

  if (isLoading) {
    return (
      <Box p={10} display="flex" justifyContent="center">
        <Spinner size="xl" />
      </Box>
    );
  }

  if (error && !config) {
    return (
      <EmptyState
        title={isAuthError ? error : m.app_error_load_config()}
        description={isAuthError ? undefined : error}
        icon={<FiAlertTriangle />}
      >
        {redirectSeconds !== null && (
          <Text fontWeight="medium">
            {m.auth_redirect_countdown({ seconds: redirectSeconds })}
          </Text>
        )}
        {!isAuthError && (
          <Button onClick={() => window.location.reload()}>{m.app_button_retry()}</Button>
        )}
      </EmptyState>
    );
  }

  if (!config) {
    return <></>;
  }

  return <>{children}</>;
};

const IconForResource = React.memo(({ selector }: { selector: OpSelector }) => {
  const status = useResourceStatus(selector);
  return iconForStatus(status);
});

const iconForStatus = (status: OperationStatus) => {
  const color = colorForStatus(status);
  switch (status) {
    case OperationStatus.STATUS_ERROR:
      return <FiAlertTriangle style={{ color }} />;
    case OperationStatus.STATUS_WARNING:
      return <FiAlertTriangle style={{ color }} />; // Using AlertTriangle for warning too
    case OperationStatus.STATUS_INPROGRESS:
      return (
        <Box animation={`${spin} 2s linear infinite`} lineHeight={0}>
          <FiLoader style={{ color }} />
        </Box>
      );
    case OperationStatus.STATUS_UNKNOWN:
      return <FiLoader style={{ color }} />;
    default:
      return <FiCheckCircle style={{ color }} />;
  }
};
