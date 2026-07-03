import {
  Flex,
  Stack,
  Input,
  createListCollection,
  IconButton,
  Text,
  Box,
} from "@chakra-ui/react";
import { useState } from "react";
import { useShowModal } from "../../components/common/ModalManager";
import {
  FiPlus as Plus,
  FiMinus as Minus,
  FiCopy as Copy,
  FiEye,
  FiEyeOff,
  FiSettings,
  FiLock,
  FiGlobe,
} from "react-icons/fi";
import { formatErrorAlert, alerts } from "../../components/common/Alerts";
import { backrestService, authenticationService } from "../../api/client";
import { clone, create, fromJson, toJson } from "@bufbuild/protobuf";
import {
  AuthSchema,
  ConfigSchema,
  UserSchema,
  MultihostSchema,
  Multihost_PeerSchema,
  Multihost_Permission_Type,
} from "../../../gen/ts/v1/config_pb";
import { GeneratePairingTokenRequestSchema } from "../../../gen/ts/v1/service_pb";
import { useSyncStates } from "../../state/peerStates";
import { PeerStateConnectionStatusIcon } from "../../components/common/SyncStateIcon";
import { isMultihostSyncEnabled } from "../../state/buildcfg";
import * as m from "../../paraglide/messages";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { PasswordInput } from "../../components/ui/password-input";
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValueText,
} from "../../components/ui/select";
import { useConfig } from "../../app/provider";
import { useUserPreferences } from "../../lib/userPreferences";
import { useDebug } from "../../lib/debug";
import {
  TwoPaneModal,
  TwoPaneSection,
  type SectionDef,
} from "../../components/common/TwoPaneModal";
import { SectionCard } from "../../components/common/SectionCard";
import { ToggleField } from "../../components/common/ToggleField";

export const SettingsModal = () => {
  const [config, setConfig] = useConfig();
  const showModal = useShowModal();
  const peerStates = useSyncStates();

  // 调试模式：URL 中带 ?debug=1 时显示被默认隐藏的高级设置。
  const debug = useDebug();
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [reloadOnCancel, setReloadOnCancel] = useState(false);

  // Pairing token generation state
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [tokenLabel, setTokenLabel] = useState("");
  const [tokenTtl, setTokenTtl] = useState("3600");
  const [tokenMaxUses, setTokenMaxUses] = useState(1);
  const [generatedToken, setGeneratedToken] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [initialTokenCount] = useState(
    () => config?.multihost?.pairingTokens?.length || 0,
  );


  // Local state initialized from config
  const [formData, setFormData] = useState<any>(() => {
    if (!config) return null;
    return {
      instance: config.instance || "gbase_onprem_backrest_server",
      auth: {
        disabled: config.auth?.disabled || false,
        users:
          config.auth?.users?.map((u: any) => ({
            ...(toJson(UserSchema, u, { alwaysEmitImplicit: true }) as any),
            isExisting: true,
          })) || [],
      },
      multihost: {
        identity: { keyid: config.multihost?.identity?.keyid || "" },
        knownHosts:
          config.multihost?.knownHosts?.map((peer: any) =>
            toJson(Multihost_PeerSchema, peer, { alwaysEmitImplicit: true }),
          ) || [],
        authorizedClients:
          config.multihost?.authorizedClients?.map((peer: any) =>
            toJson(Multihost_PeerSchema, peer, { alwaysEmitImplicit: true }),
          ) || [],
      },
    };
  });

  // 初始快照须反映「已持久化」的配置，而非已注入默认值的表单——否则当
  // config.instance 为空、表单预填了默认实例 ID 时，dirty 会误判为 false，
  // 导致这个从未保存过的默认值无法保存（保存按钮一直灰着）。
  const [initialFormData, setInitialFormData] = useState(() =>
    JSON.stringify({ ...formData, instance: config?.instance || "" }),
  );
  const dirty = JSON.stringify(formData) !== initialFormData;

  const ttlOptions = createListCollection({
    items: [
      { label: m.settings_ttl_15m(), value: "900" },
      { label: m.settings_ttl_1h(), value: "3600" },
      { label: m.settings_ttl_24h(), value: "86400" },
      { label: m.settings_ttl_7d(), value: "604800" },
      { label: m.settings_ttl_forever(), value: "0" },
    ],
  });

  const refreshConfig = async () => {
    const freshConfig = await backrestService.getConfig({});
    setConfig(freshConfig);
  };

  const handleGenerateToken = async () => {
    setGenerateLoading(true);
    try {
      const resp = await backrestService.generatePairingToken(
        create(GeneratePairingTokenRequestSchema, {
          label: tokenLabel,
          ttlSeconds: BigInt(parseInt(tokenTtl)),
          maxUses: tokenMaxUses,
          // Newly paired clients receive only the right to be pushed shared
          // repos. The host owner can edit the authorized_client entry after
          // pairing to grant additional permissions if needed.
          permissions: [
            {
              type: Multihost_Permission_Type.PERMISSION_RECEIVE_SHARED_REPOS,
              scopes: ["*"],
            },
          ],
        }),
      );
      setGeneratedToken(resp.token);
      await refreshConfig();
    } catch (e: any) {
      alerts.error(formatErrorAlert(e, m.settings_pairing_generate_failed()));
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleRemovePairingToken = async (index: number) => {
    if (!config) return;
    try {
      const newConfig = clone(ConfigSchema, config);
      if (newConfig.multihost) {
        newConfig.multihost.pairingTokens.splice(index, 1);
      }
      setConfig(await backrestService.setConfig(newConfig));
      alerts.success(m.settings_pairing_removed());
    } catch (e: any) {
      alerts.error(formatErrorAlert(e, m.settings_pairing_remove_failed()));
    }
  };


  if (!config || !formData) return null;

  const updateField = (path: string[], value: any) => {
    setFormData((prev: any) => {
      const next = { ...prev };
      let curr = next;
      for (let i = 0; i < path.length - 1; i++) {
        if (!curr[path[i]]) curr[path[i]] = {};
        curr = curr[path[i]];
      }
      curr[path[path.length - 1]] = value;
      return next;
    });
  };

  const getField = (path: string[]) => {
    let curr = formData;
    for (const p of path) {
      if (curr === undefined) return undefined;
      curr = curr[p];
    }
    return curr;
  };

  const handleOk = async () => {
    setConfirmLoading(true);
    try {
      const workingData = JSON.parse(JSON.stringify(formData));

      if (workingData.auth?.users) {
        for (const user of workingData.auth.users) {
          if (user.needsBcrypt) {
            const hash = await authenticationService.hashPassword({
              value: user.passwordBcrypt,
            });
            user.passwordBcrypt = hash.value;
            delete user.needsBcrypt;
          }
          delete user.isExisting;
        }
      }

      let newConfig = clone(ConfigSchema, config);
      newConfig.auth = fromJson(AuthSchema, workingData.auth, {
        ignoreUnknownFields: false,
      });
      newConfig.multihost = fromJson(MultihostSchema, workingData.multihost, {
        ignoreUnknownFields: false,
      });
      newConfig.instance = workingData.instance;

      if (!newConfig.auth?.users && !newConfig.auth?.disabled) {
        throw new Error(m.settings_error_no_users());
      }

      setConfig(await backrestService.setConfig(newConfig));
      setInitialFormData(JSON.stringify(formData));
      setReloadOnCancel(true);
      alerts.success(m.settings_success_updated());
    } catch (e: any) {
      alerts.error(formatErrorAlert(e, m.settings_error_operation()));
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleCancel = () => {
    showModal(null);
    if (reloadOnCancel) {
      window.location.reload();
    }
  };

  const users = getField(["auth", "users"]) || [];

  const sections: SectionDef[] = [
    { id: "general", label: m.settings_section_general(), icon: <FiSettings size={14} /> },
    { id: "auth", label: m.settings_section_authentication(), icon: <FiLock size={14} /> },
    // 多主机（身份与共享 / Pairing Tokens / 已授权实例 / 已知主机）默认隐藏，
    // 仅 URL 带 ?debug=1 时展示
    ...(isMultihostSyncEnabled && debug
      ? [
          {
            id: "multihost",
            label: m.settings_nav_multihost(),
            icon: <FiGlobe size={14} />,
          } as SectionDef,
        ]
      : []),
  ];

  return (
    <TwoPaneModal
      isOpen={true}
      onClose={handleCancel}
      title={m.settings_modal_title()}
      headerIcon={<FiSettings size={14} />}
      sections={sections}
      dirty={dirty}
      dirtyCount={1}
      onSave={handleOk}
      onDiscard={() => {
        setFormData(JSON.parse(initialFormData));
      }}
      saving={confirmLoading}
    >
      {/* General Section */}
      <TwoPaneSection id="general">
        <SectionCard
          icon={<FiSettings size={16} />}
          title={m.settings_section_general()}
          description={m.settings_section_general_desc()}
        >
          <Stack gap={4}>
            {users.length === 0 && !getField(["auth", "disabled"]) && (
              <Alert status="warning">
                <Stack gap={1}>
                  <strong>{m.settings_initial_setup_title()}</strong>
                  <Text fontSize="sm">{m.settings_initial_setup_message()}</Text>
                  <Text fontSize="xs" fontStyle="italic">
                    {m.settings_initial_setup_hint()}
                  </Text>
                </Stack>
              </Alert>
            )}

            <Field
              label={m.settings_field_instance_id()}
              helperText={m.settings_field_instance_id_tooltip()}
              required
            >
              <Input
                value={getField(["instance"])}
                onChange={(e) => updateField(["instance"], e.target.value)}
                disabled={!!config.instance}
                placeholder={m.settings_field_instance_id_placeholder()}
              />
            </Field>

            {/* 显示语言默认隐藏，仅 ?debug=1 时展示 */}
            {debug && <UserSettingsForm />}
          </Stack>
        </SectionCard>
      </TwoPaneSection>

      {/* Authentication Section */}
      <TwoPaneSection id="auth">
        <SectionCard
          icon={<FiLock size={16} />}
          title={m.settings_section_authentication()}
          description={m.settings_section_authentication_desc()}
        >
          <Stack gap={4}>
            <ToggleField
              checked={getField(["auth", "disabled"]) || false}
              onChange={(v) => updateField(["auth", "disabled"], v)}
              label={m.settings_auth_disable()}
              hint={m.settings_auth_disable_hint()}
            />

            <Field label={m.settings_auth_users()} required>
              <Stack gap={3} width="full">
                {users.map((user: any, index: number) => (
                  <Flex key={index} gap={2} align="center" width="full">
                    <Input
                      placeholder={m.settings_auth_username_placeholder()}
                      value={user.name}
                      onChange={(e) => {
                        const newUsers = [...users];
                        newUsers[index].name = e.target.value;
                        updateField(["auth", "users"], newUsers);
                      }}
                      disabled={user.isExisting}
                      flex={1}
                    />
                    <PasswordInput
                      placeholder={m.settings_auth_password_placeholder()}
                      value={user.passwordBcrypt}
                      onChange={(e) => {
                        const newUsers = [...users];
                        newUsers[index].passwordBcrypt = e.target.value;
                        newUsers[index].needsBcrypt = true;
                        updateField(["auth", "users"], newUsers);
                      }}
                      rootProps={{ flex: 1 }}
                    />
                    <IconButton
                      size="sm"
                      variant="ghost"
                      aria-label={m.aria_remove()}
                      onClick={() => {
                        const newUsers = [...users];
                        newUsers.splice(index, 1);
                        updateField(["auth", "users"], newUsers);
                      }}
                    >
                      <Minus />
                    </IconButton>
                  </Flex>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    updateField(
                      ["auth", "users"],
                      [
                        ...users,
                        {
                          name: "",
                          passwordBcrypt: "",
                          needsBcrypt: true,
                          isExisting: false,
                        },
                      ],
                    );
                  }}
                  width="full"
                >
                  <Plus /> {m.settings_auth_add_user()}
                </Button>
              </Stack>
            </Field>
          </Stack>
        </SectionCard>
      </TwoPaneSection>

      {/* Multihost Section：身份与共享 / Pairing Tokens / 已授权实例 / 已知主机，默认隐藏，仅 ?debug=1 时展示 */}
      {isMultihostSyncEnabled && debug && (
        <TwoPaneSection id="multihost">
          <SectionCard
            icon={<FiGlobe size={16} />}
            title={m.settings_section_multihost()}
            description={m.settings_section_multihost_desc()}
          >
            <Stack gap={4}>
              <Text fontStyle="italic" fontSize="sm">
                {m.settings_multihost_intro()}
              </Text>
              <Text fontStyle="italic" fontSize="sm" color="red.500">
                {m.settings_multihost_warning()}
              </Text>
              <Text fontSize="sm">
                {m.settings_multihost_docs_before()}
                <a
                  href="https://garethgeorge.github.io/backrest/docs/multihost"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "underline" }}
                >
                  {m.settings_multihost_docs_link()}
                </a>
                {m.settings_multihost_docs_after()}
              </Text>

              <Field
                label={m.settings_multihost_identity()}
                helperText={m.settings_multihost_identity_tooltip()}
              >
                <Flex gap={2} width="full">
                  <Input
                    value={getField(["multihost", "identity", "keyid"])}
                    disabled
                    flex={1}
                  />
                  <IconButton
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        getField(["multihost", "identity", "keyid"]) || "",
                      )
                    }
                    aria-label={m.aria_copy()}
                  >
                    <Copy />
                  </IconButton>
                </Flex>
              </Field>
            </Stack>
          </SectionCard>

          <SectionCard
            icon={<FiLock size={16} />}
            title={m.settings_pairing_tokens_title()}
            description={m.settings_pairing_tokens_desc()}
          >
            <Stack gap={3} width="full">
              {(config.multihost?.pairingTokens || []).map(
                (token, index) => (
                  <PairingTokenItem
                    key={index}
                    token={token}
                    isNew={index >= initialTokenCount}
                    generatedTokenString={
                      index >= initialTokenCount ? generatedToken : undefined
                    }
                    config={config}
                    onRemove={() => handleRemovePairingToken(index)}
                  />
                ),
              )}

              {showGenerateForm && (
                <Box p={4} borderWidth="1px" borderRadius="md">
                  <Stack gap={3}>
                    <Field label={m.settings_pairing_label_optional()}>
                      <Input
                        value={tokenLabel}
                        onChange={(e) => setTokenLabel(e.target.value)}
                        placeholder={m.settings_pairing_label_placeholder()}
                        width="full"
                      />
                    </Field>
                    <Field label={m.settings_pairing_ttl()}>
                      <SelectRoot
                        collection={ttlOptions}
                        value={[tokenTtl]}
                        onValueChange={(e: any) =>
                          setTokenTtl(e.value[0])
                        }
                      >
                        {/* @ts-ignore */}
                        <SelectTrigger>
                          {/* @ts-ignore */}
                          <SelectValueText placeholder={m.settings_pairing_ttl_placeholder()} />
                        </SelectTrigger>
                        {/* @ts-ignore */}
                        <SelectContent zIndex={2000}>
                          {ttlOptions.items.map((o: any) => (
                            <SelectItem item={o} key={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </SelectRoot>
                    </Field>
                    <Field label={m.settings_pairing_max_uses()} helperText={m.settings_pairing_max_uses_help()}>
                      <Input
                        type="number"
                        value={tokenMaxUses}
                        onChange={(e) =>
                          setTokenMaxUses(parseInt(e.target.value) || 0)
                        }
                        min={0}
                        width="full"
                      />
                    </Field>
                    <Flex gap={2}>
                      <Button
                        size="sm"
                        onClick={handleGenerateToken}
                        loading={generateLoading}
                      >
                        {m.button_generate()}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowGenerateForm(false);
                          setGeneratedToken("");
                        }}
                      >
                        {m.button_cancel()}
                      </Button>
                    </Flex>
                  </Stack>
                </Box>
              )}

              {!showGenerateForm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowGenerateForm(true);
                    setGeneratedToken("");
                    setTokenLabel("");
                    setTokenTtl("3600");
                    setTokenMaxUses(1);
                  }}
                  width="full"
                >
                  <Plus /> {m.settings_pairing_generate_button()}
                </Button>
              )}
            </Stack>
          </SectionCard>

          <SectionCard
            icon={<FiLock size={16} />}
            title={m.settings_multihost_authorized_clients()}
            description={m.settings_multihost_authorized_clients_tooltip()}
          >
            <PeerFormList
              items={getField(["multihost", "authorizedClients"]) || []}
              onUpdate={(items: any) =>
                updateField(["multihost", "authorizedClients"], items)
              }
              peerStates={peerStates}
              config={config}
              showInstanceUrl={false}
              peerType="authorizedClient"
            />
          </SectionCard>

          <SectionCard
            icon={<FiGlobe size={16} />}
            title={m.settings_multihost_known_hosts()}
            description={m.settings_multihost_known_hosts_tooltip()}
          >
            <KnownHostsList
              items={getField(["multihost", "knownHosts"]) || []}
              onUpdate={(items: any) =>
                updateField(["multihost", "knownHosts"], items)
              }
              peerStates={peerStates}
              config={config}
            />
          </SectionCard>
        </TwoPaneSection>
      )}
    </TwoPaneModal>
  );
};

// --- Pairing Token Item ---

const PairingTokenItem = ({
  token,
  isNew,
  generatedTokenString,
  config,
  onRemove,
}: {
  token: any;
  isNew: boolean;
  generatedTokenString?: string;
  config: any;
  onRemove: () => void;
}) => {
  const [showToken, setShowToken] = useState(isNew);

  // Build the full token string: <keyid>:<secret>#<instanceid>
  const fullTokenString =
    generatedTokenString ||
    `${config.multihost?.identity?.keyid || ""}:${token.secret || ""}#${config.instance || ""}`;

  const isExpired =
    token.expiresAtUnix > 0n &&
    token.expiresAtUnix < BigInt(Math.floor(Date.now() / 1000));
  const usesText =
    token.maxUses === 0
      ? m.settings_pairing_uses_unlimited({ uses: token.uses })
      : m.settings_pairing_uses_limited({ uses: token.uses, maxUses: token.maxUses });
  const expiryText =
    token.expiresAtUnix === 0n
      ? m.settings_pairing_never_expires()
      : isExpired
        ? m.settings_pairing_expired({ date: new Date(Number(token.expiresAtUnix) * 1000).toLocaleString() })
        : m.settings_pairing_expires({ date: new Date(Number(token.expiresAtUnix) * 1000).toLocaleString() });

  return (
    <Box p={3} borderWidth="1px" borderRadius="md">
      <Flex justify="space-between" align="center" width="full">
        <Stack gap={0}>
          <Text fontSize="sm" fontWeight="medium">
            {token.label || m.settings_pairing_no_label()}
          </Text>
          <Text fontSize="xs" color={isExpired ? "red.500" : "gray.500"}>
            {expiryText} -- {usesText}
          </Text>
        </Stack>
        <Flex gap={1} align="center">
          <IconButton
            size="xs"
            variant="ghost"
            onClick={() => setShowToken(!showToken)}
            aria-label={showToken ? m.settings_pairing_hide_token() : m.settings_pairing_show_token()}
          >
            {showToken ? <FiEyeOff size={14} /> : <FiEye size={14} />}
          </IconButton>
          <IconButton
            size="xs"
            variant="ghost"
            onClick={onRemove}
            aria-label={m.settings_pairing_remove_token()}
          >
            <Minus />
          </IconButton>
        </Flex>
      </Flex>
      {showToken && (
        <Flex gap={2} mt={2} width="full">
          <Input value={fullTokenString} readOnly flex={1} size="sm" />
          <IconButton
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(fullTokenString)}
            aria-label={m.settings_pairing_copy_token()}
          >
            <Copy />
          </IconButton>
        </Flex>
      )}
    </Box>
  );
};

// --- Known Hosts List (with integrated pairing) ---

const KnownHostsList = ({
  items,
  onUpdate,
  peerStates,
  config,
}: any) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [pairToken, setPairToken] = useState("");
  const [pairInstanceUrl, setPairInstanceUrl] = useState("");

  const handleRemove = (index: number) => {
    const next = [...items];
    next.splice(index, 1);
    onUpdate(next);
  };

  const handleItemUpdate = (index: number, val: any) => {
    const next = [...items];
    next[index] = val;
    onUpdate(next);
  };

  const handleAdd = () => {
    try {
      if (!pairToken.trim()) {
        onUpdate([
          ...items,
          {
            instanceId: "",
            keyId: "",
            instanceUrl: pairInstanceUrl,
            permissions: [
              {
                type: "PERMISSION_READ_OPERATIONS",
                scopes: ["*"],
              },
              {
                type: "PERMISSION_RECEIVE_SHARED_REPOS",
              },
            ],
          },
        ]);
        setShowAddForm(false);
        setPairToken("");
        setPairInstanceUrl("");
        return;
      }

      const hashIdx = pairToken.indexOf("#");
      const colonIdx = pairToken.indexOf(":");
      if (hashIdx === -1 || colonIdx === -1 || colonIdx > hashIdx) {
        throw new Error(m.settings_known_host_invalid_token());
      }
      const keyId = pairToken.substring(0, colonIdx);
      const secret = pairToken.substring(colonIdx + 1, hashIdx);
      const instanceId = pairToken.substring(hashIdx + 1);

      if (!keyId || !secret || !instanceId) {
        throw new Error(m.settings_known_host_token_missing_fields());
      }
      if (!pairInstanceUrl) {
        throw new Error(m.settings_known_host_url_required());
      }

      onUpdate([
        ...items,
        {
          instanceId,
          keyId,
          instanceUrl: pairInstanceUrl,
          initialPairingSecret: secret,
          permissions: [
            {
              type: "PERMISSION_READ_OPERATIONS",
              scopes: ["*"],
            },
            {
              type: "PERMISSION_RECEIVE_SHARED_REPOS",
            },
          ],
        },
      ]);

      setPairToken("");
      setPairInstanceUrl("");
      setShowAddForm(false);
      alerts.success(m.settings_known_host_added());
    } catch (e: any) {
      alerts.error(formatErrorAlert(e, m.settings_known_host_add_failed()));
    }
  };

  return (
    <Stack gap={4} width="full">
      {items.map((item: any, index: number) => (
        <PeerFormListItem
          key={index}
          item={item}
          onChange={(val: any) => handleItemUpdate(index, val)}
          onRemove={() => handleRemove(index)}
          peerStates={peerStates}
          showInstanceUrl={true}
          config={config}
        />
      ))}

      {showAddForm ? (
        <Box p={4} borderWidth="1px" borderRadius="md">
          <Stack gap={3}>
            <Text fontSize="sm" color="gray.500">
              {m.settings_known_host_paste_hint()}
            </Text>
            <Field label={m.settings_known_host_pairing_token()}>
              <Input
                value={pairToken}
                onChange={(e) => setPairToken(e.target.value)}
                placeholder='<keyid>:<secret>#<instanceid>'
                width="full"
              />
            </Field>
            <Field label={m.settings_known_host_instance_url()} required>
              <Input
                value={pairInstanceUrl}
                onChange={(e) => setPairInstanceUrl(e.target.value)}
                placeholder={m.settings_known_host_url_placeholder()}
                width="full"
              />
            </Field>
            <Flex gap={2}>
              <Button size="sm" onClick={handleAdd}>
                {pairToken.trim() ? m.button_pair() : m.button_add()}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setPairToken("");
                  setPairInstanceUrl("");
                }}
              >
                {m.button_cancel()}
              </Button>
            </Flex>
          </Stack>
        </Box>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAddForm(true)}
          width="full"
        >
          <Plus />{" "}
          {m.settings_peer_add_button({
            itemTypeName: m.settings_multihost_known_host_item(),
          })}
        </Button>
      )}
    </Stack>
  );
};

// --- Peer Sub-components ---

const PeerFormList = ({
  items,
  onUpdate,
  peerStates,
  config,
  showInstanceUrl,
  peerType,
}: any) => {
  const handleRemove = (index: number) => {
    const next = [...items];
    next.splice(index, 1);
    onUpdate(next);
  };

  const handleItemUpdate = (index: number, val: any) => {
    const next = [...items];
    next[index] = val;
    onUpdate(next);
  };

  return (
    <Stack gap={4} width="full">
      {items.length === 0 && (
        <Text fontSize="sm" color="fg.muted" fontStyle="italic">
          {m.settings_no_trusted_peers()}
        </Text>
      )}
      {items.map((item: any, index: number) => (
        <PeerFormListItem
          key={index}
          item={item}
          onChange={(val: any) => handleItemUpdate(index, val)}
          onRemove={() => handleRemove(index)}
          peerStates={peerStates}
          showInstanceUrl={showInstanceUrl}
          config={config}
          peerType={peerType}
        />
      ))}
    </Stack>
  );
};

const PeerFormListItem = ({
  item,
  onChange,
  onRemove,
  peerStates,
  showInstanceUrl,
  config,
  peerType,
}: any) => {
  const peerState = peerStates.find(
    (state: any) => state.peerKeyid === item.keyId,
  );

  const updateItem = (field: string, val: any) => {
    onChange({ ...item, [field]: val });
  };

  return (
    <Box p={4} borderWidth="1px" borderRadius="md">
      <Stack gap={3}>
        <Flex gap={4} align="center">
          <Field label={m.settings_peer_instance_id()} required flex={1}>
            <Input
              value={item.instanceId}
              onChange={(e) => updateItem("instanceId", e.target.value)}
              placeholder={m.settings_peer_instance_id_placeholder()}
            />
          </Field>
          <Field label={m.settings_peer_key_id()} required flex={1.2}>
            <Input
              value={item.keyId}
              onChange={(e) => updateItem("keyId", e.target.value)}
              placeholder={m.settings_peer_key_id_placeholder()}
            />
          </Field>
          <Flex gap={1} align="center" alignSelf="flex-start" mt={1} flexShrink={0}>
            {peerState && (
              <PeerStateConnectionStatusIcon peerState={peerState} />
            )}
            <IconButton
              size="xs"
              variant="ghost"
              onClick={onRemove}
              aria-label={m.aria_remove()}
            >
              <Minus />
            </IconButton>
          </Flex>
        </Flex>

        {showInstanceUrl && (
          <Field label={m.settings_peer_instance_url()} required>
            <Input
              value={item.instanceUrl}
              onChange={(e) => updateItem("instanceUrl", e.target.value)}
              placeholder={m.settings_peer_instance_url_placeholder()}
            />
          </Field>
        )}

        <PeerPermissionsTile
          permissions={item.permissions || []}
          onUpdate={(perms: any) => updateItem("permissions", perms)}
          config={config}
          peerType={peerType}
        />
      </Stack>
    </Box>
  );
};

const PeerPermissionsTile = ({ permissions, onUpdate, config, peerType }: any) => {
  const isAuthorizedClient = peerType === "authorizedClient";

  const repoOptions = createListCollection({
    items: [
      { label: m.settings_permission_scope_all(), value: "*" },
      ...(config.repos || []).map((repo: any) => ({
        label: repo.id,
        value: `repo:${repo.id}`,
      })),
    ],
  });

  // Allowed permission types depend on direction. See proto/v1/config.proto:
  //   - Known host (client → host): READ_OPERATIONS lets us push our ops up,
  //     READ_WRITE_CONFIG lets the host edit our config in scope,
  //     RECEIVE_SHARED_REPOS lets us accept shared repos pushed by the host.
  //   - Authorized client (host → client): only RECEIVE_SHARED_REPOS does
  //     anything host-side today (it gates which shared repos we push and
  //     supports per-repo scopes). The other enum values exist on the proto
  //     but are no-ops on the host, so we don't expose them in the UI.
  // Permission type values must match what toJson produces for enum fields (string names, not numbers).
  const permissionTypeItems = isAuthorizedClient
    ? [
        {
          label: m.settings_permission_push_repos(),
          value: "PERMISSION_RECEIVE_SHARED_REPOS",
        },
      ]
    : [
        {
          label: m.settings_permission_edit_repo(),
          value: "PERMISSION_READ_WRITE_CONFIG",
        },
        {
          label: m.settings_permission_read_ops(),
          value: "PERMISSION_READ_OPERATIONS",
        },
        {
          label: m.settings_permission_receive_repos(),
          value: "PERMISSION_RECEIVE_SHARED_REPOS",
        },
      ];
  const permissionTypeOptions = createListCollection({ items: permissionTypeItems });

  // Hide the scope picker when scopes are meaningless for this direction:
  //   - On a known host, RECEIVE_SHARED_REPOS is evaluated scope-lessly by the
  //     client (we don't pre-know the incoming repo IDs).
  //   - On an authorized client, RECEIVE_SHARED_REPOS supports scopes (the host
  //     filters which shared repos to push), so the selector stays visible.
  const showScopesFor = (permType: string) =>
    permType !== "PERMISSION_RECEIVE_SHARED_REPOS" || isAuthorizedClient;

  const handleAdd = () => {
    const defaultType = isAuthorizedClient
      ? "PERMISSION_RECEIVE_SHARED_REPOS"
      : "PERMISSION_READ_OPERATIONS";
    const next: any = { type: defaultType };
    if (showScopesFor(defaultType)) {
      next.scopes = ["*"];
    }
    onUpdate([...permissions, next]);
  };

  const handleRemove = (index: number) => {
    const next = [...permissions];
    next.splice(index, 1);
    onUpdate(next);
  };

  const handleUpdate = (index: number, field: string, val: any) => {
    const next = [...permissions];
    next[index] = { ...next[index], [field]: val };
    onUpdate(next);
  };

  return (
    <Stack gap={2}>
      <Text fontWeight="bold" fontSize="sm">
        {m.settings_peer_permissions()}
      </Text>
      {permissions.map((perm: any, index: number) => (
        <Box
          key={index}
          p={3}
          borderWidth="1px"
          borderRadius="sm"
          bg="gray.50"
          _dark={{ bg: "gray.800" }}
        >
          <Flex gap={2} align="flex-end">
            <Field label={m.settings_peer_permission_type()} flex={1}>
              <SelectRoot
                collection={permissionTypeOptions}
                value={[perm.type.toString()]}
                onValueChange={(e: any) =>
                  handleUpdate(index, "type", e.value[0])
                }
              >
                {/* @ts-ignore */}
                <SelectTrigger>
                  {/* @ts-ignore */}
                  <SelectValueText
                    placeholder={m.settings_permission_type_placeholder()}
                  />
                </SelectTrigger>
                {/* @ts-ignore */}
                <SelectContent zIndex={2000}>
                  {permissionTypeOptions.items.map((o: any) => (
                    <SelectItem item={o} key={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </Field>

            {showScopesFor(perm.type) && (
              <Field label={m.settings_peer_permission_scopes()} flex={1}>
                <SelectRoot
                  multiple
                  collection={repoOptions}
                  value={perm.scopes}
                  onValueChange={(e: any) =>
                    handleUpdate(index, "scopes", e.value)
                  }
                >
                  {/* @ts-ignore */}
                  <SelectTrigger>
                    {/* @ts-ignore */}
                    <SelectValueText
                      placeholder={m.settings_permission_scope_placeholder()}
                    />
                  </SelectTrigger>
                  {/* @ts-ignore */}
                  <SelectContent zIndex={2000}>
                    {repoOptions.items.map((o: any) => (
                      <SelectItem item={o} key={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
              </Field>
            )}

            <IconButton
              size="sm"
              variant="ghost"
              onClick={() => handleRemove(index)}
              aria-label={m.settings_peer_remove_permission_aria()}
            >
              <Minus size={14} />
            </IconButton>
          </Flex>
        </Box>
      ))}
      <Button
        size="xs"
        variant="ghost"
        onClick={handleAdd}
        justifyContent="start"
      >
        <Plus size={14} /> {m.settings_peer_add_permission()}
      </Button>
    </Stack>
  );
};

const Alert = ({ status, children }: any) => (
  <Box
    p={4}
    borderRadius="md"
    bg={status === "warning" ? "orange.100" : "blue.100"}
    color={status === "warning" ? "orange.800" : "blue.800"}
    _dark={{ bg: "orange.900", color: "orange.200" }}
  >
    {children}
  </Box>
);

const languageNames: Record<string, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語",
};

const UserSettingsForm = () => {
  const { preferences, updatePreference, availableLanguages } =
    useUserPreferences();

  const languageOptions = createListCollection({
    items: availableLanguages.map((tag: string) => ({
      label: languageNames[tag] || tag,
      value: tag,
    })),
  });

  return (
    <Field label={m.settings_field_language()}>
      <SelectRoot
        collection={languageOptions}
        value={[preferences.language]}
        onValueChange={(e: any) => updatePreference("language", e.value[0])}
      >
        {/* @ts-ignore */}
        <SelectTrigger>
          {/* @ts-ignore */}
          <SelectValueText placeholder={m.settings_select_language_placeholder()} />
        </SelectTrigger>
        {/* @ts-ignore */}
        <SelectContent zIndex={2000}>
          {languageOptions.items.map((option: any) => (
            <SelectItem item={option} key={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    </Field>
  );
};
