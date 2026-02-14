import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartInput } from "@/components/ui/smart-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BidiText, LtrInline } from "@/components/ui/bidi-text";
import { Plus, Search, Pencil, Trash2, Building2, User, Phone as PhoneIcon, Mail, Eye, Briefcase, MessageSquare, PhoneCall, Clock, CheckCircle } from "lucide-react";
import { useClients } from "@/lib/clients-context";
import { useFavorites } from "@/lib/favorites-context";
import { FavoriteButton } from "@/components/favorite-button";
import { useAuth } from "@/lib/auth-context";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useContacts } from "@/lib/contacts-context";
import type { Client, ClientTypeValue, ContactTypeValue, FollowUpStatusValue } from "@shared/schema";
import { ClientType, CaseStageLabels, ContactType, ContactTypeLabels, FollowUpStatus, FollowUpStatusLabels } from "@shared/schema";
import { formatDateArabic } from "@/lib/date-utils";

export default function ClientsPage() {
  const { clients, addClient, updateClient, deleteClient, getClientName } = useClients();
  const { user, permissions } = useAuth();
  const { cases } = useCases();
  const { consultations } = useConsultations();
  const { contacts, addContact, getContactsByClientId, getLastContactByClientId, markFollowUpComplete } = useContacts();
  const { addRecentVisit } = useFavorites();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [detailsTab, setDetailsTab] = useState("info");
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [contactFormData, setContactFormData] = useState({
    contactType: ContactType.PHONE_CALL as ContactTypeValue,
    contactDate: new Date().toISOString().split('T')[0],
    nextFollowUpDate: "",
    notes: "",
  });

  const [formData, setFormData] = useState<Partial<Client>>({
    clientType: "فرد",
    individualName: "",
    nationalId: "",
    phone: "",
    companyName: "",
    commercialRegister: "",
    representativeName: "",
    representativeTitle: "",
    companyPhone: "",
    email: "",
    address: "",
    notes: "",
  });

  const resetForm = () => {
    setFormData({
      clientType: "فرد",
      individualName: "",
      nationalId: "",
      phone: "",
      companyName: "",
      commercialRegister: "",
      representativeName: "",
      representativeTitle: "",
      companyPhone: "",
      email: "",
      address: "",
      notes: "",
    });
  };

  const handleAddClient = () => {
    if (!user) return;
    addClient(formData, user.id);
    setIsAddDialogOpen(false);
    resetForm();
  };

  const handleEditClient = () => {
    if (!editingClient) return;
    updateClient(editingClient.id, formData);
    setEditingClient(null);
    resetForm();
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setFormData({ ...client });
  };

  const getClientCasesCount = (clientId: string) => {
    return cases.filter((c) => c.clientId === clientId).length;
  };

  const getClientConsultationsCount = (clientId: string) => {
    return consultations.filter((c) => c.clientId === clientId).length;
  };

  const getClientCases = (clientId: string) => {
    return cases.filter((c) => c.clientId === clientId);
  };

  const getClientConsultations = (clientId: string) => {
    return consultations.filter((c) => c.clientId === clientId);
  };

  const getClientContactsCount = (clientId: string) => {
    return getContactsByClientId(clientId).length;
  };

  const handleAddContact = () => {
    if (!viewingClient || !user) return;
    addContact({
      clientId: viewingClient.id,
      contactType: contactFormData.contactType,
      contactDate: contactFormData.contactDate,
      nextFollowUpDate: contactFormData.nextFollowUpDate || null,
      followUpStatus: contactFormData.nextFollowUpDate ? FollowUpStatus.PENDING : FollowUpStatus.COMPLETED,
      notes: contactFormData.notes,
      createdBy: user.id,
    });
    setContactFormData({
      contactType: ContactType.PHONE_CALL,
      contactDate: new Date().toISOString().split('T')[0],
      nextFollowUpDate: "",
      notes: "",
    });
    setIsAddContactOpen(false);
  };

  const renderContactForm = () => (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>نوع التواصل</Label>
          <Select
            value={contactFormData.contactType}
            onValueChange={(value: ContactTypeValue) =>
              setContactFormData({ ...contactFormData, contactType: value })
            }
          >
            <SelectTrigger data-testid="select-contact-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ContactType).map(([key, value]) => (
                <SelectItem key={key} value={value}>
                  {ContactTypeLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>تاريخ التواصل</Label>
          <Input
            dir="ltr"
            type="date"
            value={contactFormData.contactDate}
            onChange={(e) => setContactFormData({ ...contactFormData, contactDate: e.target.value })}
            data-testid="input-contact-date"
          />
        </div>
      </div>
      <div>
        <Label>تاريخ المتابعة القادمة (اختياري)</Label>
        <Input
          dir="ltr"
          type="date"
          value={contactFormData.nextFollowUpDate}
          onChange={(e) => setContactFormData({ ...contactFormData, nextFollowUpDate: e.target.value })}
          data-testid="input-followup-date"
        />
      </div>
      <div>
        <Label>ملاحظات</Label>
        <Textarea
          value={contactFormData.notes}
          onChange={(e) => setContactFormData({ ...contactFormData, notes: e.target.value })}
          placeholder="أضف ملاحظات حول هذا التواصل..."
          data-testid="input-contact-notes"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleAddContact} data-testid="button-save-contact">
          حفظ التواصل
        </Button>
        <Button variant="outline" onClick={() => setIsAddContactOpen(false)}>
          إلغاء
        </Button>
      </div>
    </div>
  );

  const filteredClients = clients.filter((client) => {
    const name = client.clientType === "فرد" ? client.individualName : client.companyName;
    const matchesSearch =
      name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.phone.includes(searchQuery) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || client.clientType === typeFilter;
    return matchesSearch && matchesType;
  });

  const renderClientForm = () => (
    <div className="space-y-4">
      <div>
        <Label>نوع العميل</Label>
        <Select
          value={formData.clientType}
          onValueChange={(value: ClientTypeValue) =>
            setFormData({ ...formData, clientType: value })
          }
        >
          <SelectTrigger data-testid="select-client-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="فرد">فرد</SelectItem>
            <SelectItem value="شركة">شركة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.clientType === "فرد" ? (
        <>
          <div>
            <Label>الاسم الكامل</Label>
            <SmartInput
              inputType="text"
              data-testid="input-individual-name"
              value={formData.individualName || ""}
              onChange={(e) => setFormData({ ...formData, individualName: e.target.value })}
              placeholder="أدخل اسم العميل"
            />
          </div>
          <div>
            <Label>رقم الهوية</Label>
            <SmartInput
              inputType="numeric"
              data-testid="input-national-id"
              value={formData.nationalId || ""}
              onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
              placeholder="رقم الهوية الوطنية"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <Label>اسم الشركة</Label>
            <SmartInput
              inputType="text"
              data-testid="input-company-name"
              value={formData.companyName || ""}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              placeholder="أدخل اسم الشركة"
            />
          </div>
          <div>
            <Label>السجل التجاري</Label>
            <SmartInput
              inputType="numeric"
              data-testid="input-commercial-register"
              value={formData.commercialRegister || ""}
              onChange={(e) => setFormData({ ...formData, commercialRegister: e.target.value })}
              placeholder="رقم السجل التجاري"
            />
          </div>
          <div>
            <Label>اسم الممثل</Label>
            <SmartInput
              inputType="text"
              data-testid="input-representative-name"
              value={formData.representativeName || ""}
              onChange={(e) => setFormData({ ...formData, representativeName: e.target.value })}
              placeholder="اسم ممثل الشركة"
            />
          </div>
          <div>
            <Label>صفة الممثل</Label>
            <SmartInput
              inputType="text"
              data-testid="input-representative-title"
              value={formData.representativeTitle || ""}
              onChange={(e) => setFormData({ ...formData, representativeTitle: e.target.value })}
              placeholder="مثال: المدير العام"
            />
          </div>
        </>
      )}

      <div>
        <Label>رقم الجوال</Label>
        <SmartInput
          inputType="phone"
          data-testid="input-phone"
          value={formData.phone || ""}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="05xxxxxxxx"
        />
      </div>
      <div>
        <Label>البريد الإلكتروني</Label>
        <SmartInput
          inputType="email"
          data-testid="input-email"
          type="email"
          value={formData.email || ""}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="email@example.com"
        />
      </div>
      <div>
        <Label>العنوان</Label>
        <SmartInput
          inputType="text"
          data-testid="input-address"
          value={formData.address || ""}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          placeholder="المدينة - الحي"
        />
      </div>
      <div>
        <Label>ملاحظات</Label>
        <Textarea
          data-testid="input-notes"
          value={formData.notes || ""}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="ملاحظات إضافية..."
        />
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة العملاء</h1>
          <p className="text-muted-foreground">قائمة العملاء (أفراد وشركات)</p>
        </div>
        {permissions.canAddCasesAndConsultations && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-client" onClick={resetForm}>
                <Plus className="w-4 h-4 ml-2" />
                إضافة عميل
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>إضافة عميل جديد</DialogTitle>
              </DialogHeader>
              {renderClientForm()}
              <Button data-testid="button-submit-client" onClick={handleAddClient} className="w-full">
                إضافة العميل
              </Button>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <SmartInput
                inputType="text"
                data-testid="input-search-clients"
                placeholder="بحث بالاسم أو الجوال..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
                <SelectValue placeholder="النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="فرد">أفراد</SelectItem>
                <SelectItem value="شركة">شركات</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">التواصل</TableHead>
                <TableHead className="text-right">القضايا</TableHead>
                <TableHead className="text-right">الاستشارات</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => (
                <TableRow key={client.id} data-testid={`row-client-${client.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {client.clientType === "فرد" ? (
                          <User className="w-5 h-5 text-primary" />
                        ) : (
                          <Building2 className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          <BidiText>{client.clientType === "فرد" ? client.individualName : client.companyName}</BidiText>
                        </p>
                        {client.clientType === "شركة" && client.representativeName && (
                          <p className="text-sm text-muted-foreground">
                            {client.representativeName} - {client.representativeTitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={client.clientType === "فرد" ? "secondary" : "outline"}>
                      {client.clientType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-sm">
                        <PhoneIcon className="w-3 h-3" />
                        <LtrInline>{client.phone}</LtrInline>
                      </div>
                      {client.email && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          <LtrInline>{client.email}</LtrInline>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getClientCasesCount(client.id)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getClientConsultationsCount(client.id)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FavoriteButton
                        entityType="client"
                        entityId={client.id}
                        entityTitle={client.clientType === "فرد" ? client.individualName || "-" : client.companyName || "-"}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-view-client-${client.id}`}
                            onClick={() => { 
                              setViewingClient(client); 
                              setDetailsTab("info"); 
                              addRecentVisit("client", client.id, client.clientType === "فرد" ? client.individualName || "-" : client.companyName || "-");
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>عرض التفاصيل</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-edit-client-${client.id}`}
                            onClick={() => openEditDialog(client)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>تعديل بيانات العميل</TooltipContent>
                      </Tooltip>
                      {permissions.canManageUsers && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-delete-client-${client.id}`}
                              onClick={() => deleteClient(client.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>حذف العميل</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل بيانات العميل</DialogTitle>
          </DialogHeader>
          {renderClientForm()}
          <Button data-testid="button-update-client" onClick={handleEditClient} className="w-full">
            حفظ التعديلات
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingClient} onOpenChange={(open) => !open && setViewingClient(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                {viewingClient?.clientType === "فرد" ? (
                  <User className="w-5 h-5 text-primary" />
                ) : (
                  <Building2 className="w-5 h-5 text-primary" />
                )}
              </div>
              <BidiText>{viewingClient?.clientType === "فرد" ? viewingClient?.individualName : viewingClient?.companyName}</BidiText>
            </DialogTitle>
          </DialogHeader>
          {viewingClient && (
            <Tabs value={detailsTab} onValueChange={setDetailsTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="info" data-testid="tab-client-info">المعلومات</TabsTrigger>
                <TabsTrigger value="contacts" data-testid="tab-client-contacts">
                  <PhoneCall className="w-4 h-4 ml-2" />
                  سجل التواصل ({getClientContactsCount(viewingClient.id)})
                </TabsTrigger>
                <TabsTrigger value="cases" data-testid="tab-client-cases">
                  <Briefcase className="w-4 h-4 ml-2" />
                  القضايا ({getClientCasesCount(viewingClient.id)})
                </TabsTrigger>
                <TabsTrigger value="consultations" data-testid="tab-client-consultations">
                  <MessageSquare className="w-4 h-4 ml-2" />
                  الاستشارات ({getClientConsultationsCount(viewingClient.id)})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">نوع العميل</Label>
                    <p className="font-medium">{viewingClient.clientType}</p>
                  </div>
                  {viewingClient.clientType === "فرد" ? (
                    <>
                      <div>
                        <Label className="text-muted-foreground">الاسم</Label>
                        <p className="font-medium"><BidiText>{viewingClient.individualName}</BidiText></p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">رقم الهوية</Label>
                        <p className="font-medium"><LtrInline>{viewingClient.nationalId || "-"}</LtrInline></p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label className="text-muted-foreground">اسم الشركة</Label>
                        <p className="font-medium"><BidiText>{viewingClient.companyName}</BidiText></p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">السجل التجاري</Label>
                        <p className="font-medium"><LtrInline>{viewingClient.commercialRegister || "-"}</LtrInline></p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">ممثل الشركة</Label>
                        <p className="font-medium"><BidiText>{viewingClient.representativeName || "-"}</BidiText></p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">صفة الممثل</Label>
                        <p className="font-medium"><BidiText>{viewingClient.representativeTitle || "-"}</BidiText></p>
                      </div>
                    </>
                  )}
                  <div>
                    <Label className="text-muted-foreground">رقم الجوال</Label>
                    <p className="font-medium"><LtrInline>{viewingClient.phone}</LtrInline></p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">البريد الإلكتروني</Label>
                    <p className="font-medium"><LtrInline>{viewingClient.email || "-"}</LtrInline></p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">العنوان</Label>
                    <p className="font-medium">{viewingClient.address || "-"}</p>
                  </div>
                  {viewingClient.notes && (
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">ملاحظات</Label>
                      <p className="text-sm bg-muted p-2 rounded">{viewingClient.notes}</p>
                    </div>
                  )}
                </div>
                <div className="border-t pt-4 text-sm text-muted-foreground">
                  تاريخ الإضافة: {formatDateArabic(viewingClient.createdAt)}
                </div>
              </TabsContent>

              <TabsContent value="contacts" className="mt-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">سجل التواصل</h3>
                  {!isAddContactOpen && (
                    <Button size="sm" onClick={() => setIsAddContactOpen(true)} data-testid="button-add-contact">
                      <Plus className="w-4 h-4 ml-2" />
                      تواصل جديد
                    </Button>
                  )}
                </div>
                
                {isAddContactOpen && renderContactForm()}
                
                {(() => {
                  const clientContacts = getContactsByClientId(viewingClient.id);
                  if (clientContacts.length === 0 && !isAddContactOpen) {
                    return <p className="text-muted-foreground text-center py-8">لا يوجد سجل تواصل لهذا العميل</p>;
                  }
                  if (clientContacts.length === 0) return null;
                  return (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">نوع التواصل</TableHead>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">المتابعة القادمة</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">الملاحظات</TableHead>
                          <TableHead className="text-right">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientContacts.map((contact) => (
                          <TableRow key={contact.id}>
                            <TableCell>
                              <Badge variant="outline">{ContactTypeLabels[contact.contactType]}</Badge>
                            </TableCell>
                            <TableCell>
                              {formatDateArabic(contact.contactDate)}
                            </TableCell>
                            <TableCell>
                              {contact.nextFollowUpDate ? (
                                <span className={new Date(contact.nextFollowUpDate) < new Date() && contact.followUpStatus === FollowUpStatus.PENDING ? "text-destructive font-medium" : ""}>
                                  {formatDateArabic(contact.nextFollowUpDate)}
                                </span>
                              ) : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={contact.followUpStatus === FollowUpStatus.COMPLETED ? "default" : "secondary"}
                              >
                                {FollowUpStatusLabels[contact.followUpStatus]}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {contact.notes || "-"}
                            </TableCell>
                            <TableCell>
                              {contact.followUpStatus === FollowUpStatus.PENDING && (
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => markFollowUpComplete(contact.id)}
                                  data-testid={`button-complete-followup-${contact.id}`}
                                >
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  );
                })()}
              </TabsContent>

              <TabsContent value="cases" className="mt-4">
                {(() => {
                  const clientCases = getClientCases(viewingClient.id);
                  if (clientCases.length === 0) {
                    return <p className="text-muted-foreground text-center py-8">لا توجد قضايا مسجلة لهذا العميل</p>;
                  }
                  return (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">رقم القضية</TableHead>
                          <TableHead className="text-right">النوع</TableHead>
                          <TableHead className="text-right">المرحلة الحالية</TableHead>
                          <TableHead className="text-right">التاريخ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientCases.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.caseNumber}</TableCell>
                            <TableCell>{c.caseType}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{CaseStageLabels[c.currentStage] || c.currentStage}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDateArabic(c.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  );
                })()}
              </TabsContent>

              <TabsContent value="consultations" className="mt-4">
                {(() => {
                  const clientConsultations = getClientConsultations(viewingClient.id);
                  if (clientConsultations.length === 0) {
                    return <p className="text-muted-foreground text-center py-8">لا توجد استشارات مسجلة لهذا العميل</p>;
                  }
                  return (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">رقم الاستشارة</TableHead>
                          <TableHead className="text-right">النوع</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">التاريخ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientConsultations.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.consultationNumber}</TableCell>
                            <TableCell>{c.consultationType}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{c.status}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDateArabic(c.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  );
                })()}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
